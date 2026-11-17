import { useCallback, useEffect, useRef, useState } from 'react'
import { PermissionsAndroid, Platform, type Permission } from 'react-native'
import {
  BleManager,
  type Device,
  type Characteristic,
  type Subscription,
} from 'react-native-ble-plx'

export type BLEStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

// Standard 16-bit Bluetooth SIG UUIDs expanded to their 128-bit form.
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb'
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb'

const SCAN_TIMEOUT_MS = 12000

interface HRReading {
  hr: number
  contact: 'detected' | 'not-detected' | 'unsupported'
  energyKJ?: number
  rrIntervals?: number[]
}

// react-native-ble-plx needs a native module that isn't present in Expo Go (or
// on web), where constructing BleManager throws. We attempt it once and treat a
// failure as "BLE unavailable" so the app falls back to the simulator instead
// of crashing. Real sensors work once the app runs in a dev client / native build.
let manager: BleManager | null = null
let bleAvailable = false
try {
  manager = new BleManager()
  bleAvailable = true
} catch {
  manager = null
  bleAvailable = false
}

// Decode a base64 characteristic value into a DataView for byte-level parsing.
function base64ToDataView(b64: string): DataView {
  const binary = globalThis.atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new DataView(bytes.buffer)
}

// Parses the Heart Rate Measurement characteristic per the Bluetooth GATT spec.
// Bit 0 of flags: 0 = uint8 HR, 1 = uint16 HR.
// Bit 1-2: sensor contact status. Bit 3: energy expended. Bit 4: RR-interval values present.
function parseHeartRateMeasurement(value: DataView): HRReading {
  const flags = value.getUint8(0)
  const isUint16 = (flags & 0x01) !== 0
  const contactSupported = (flags & 0x04) !== 0
  const contactDetected = (flags & 0x02) !== 0
  const energyPresent = (flags & 0x08) !== 0
  const rrPresent = (flags & 0x10) !== 0

  let offset = 1
  const hr = isUint16 ? value.getUint16(offset, true) : value.getUint8(offset)
  offset += isUint16 ? 2 : 1

  let energyKJ: number | undefined
  if (energyPresent) {
    energyKJ = value.getUint16(offset, true)
    offset += 2
  }

  const rrIntervals: number[] = []
  if (rrPresent) {
    while (offset + 1 < value.byteLength) {
      rrIntervals.push(value.getUint16(offset, true) / 1024)
      offset += 2
    }
  }

  return {
    hr,
    contact: contactSupported ? (contactDetected ? 'detected' : 'not-detected') : 'unsupported',
    energyKJ,
    rrIntervals: rrIntervals.length ? rrIntervals : undefined,
  }
}

// Request the runtime permissions BLE scanning needs on Android. iOS handles
// this via the Info.plist usage strings + a system prompt on first use.
async function ensureAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const perms = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ].filter(Boolean) as Permission[]
  const granted = await PermissionsAndroid.requestMultiple(perms)
  return perms.every(p => granted[p] === PermissionsAndroid.RESULTS.GRANTED)
}

export function useHeartRate() {
  const supported = Platform.OS !== 'web' && bleAvailable
  const [status, setStatus] = useState<BLEStatus>(supported ? 'disconnected' : 'unsupported')
  const [hr, setHR] = useState<number | null>(null)
  const [contact, setContact] = useState<HRReading['contact']>('unsupported')
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const deviceRef = useRef<Device | null>(null)
  const monitorRef = useRef<Subscription | null>(null)
  const disconnectRef = useRef<Subscription | null>(null)
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanup = useCallback(() => {
    monitorRef.current?.remove()
    monitorRef.current = null
    disconnectRef.current?.remove()
    disconnectRef.current = null
    setHR(null)
    setContact('unsupported')
    setDeviceName(null)
    setStatus('disconnected')
  }, [])

  const onMeasurement = useCallback(
    (err: unknown, char: Characteristic | null) => {
      if (err || !char?.value) return
      const reading = parseHeartRateMeasurement(base64ToDataView(char.value))
      setHR(reading.hr)
      setContact(reading.contact)
    },
    [],
  )

  const connectToDevice = useCallback(
    async (device: Device) => {
      try {
        deviceRef.current = device
        disconnectRef.current = device.onDisconnected(() => cleanup())

        const connected = await device.connect()
        await connected.discoverAllServicesAndCharacteristics()
        monitorRef.current = connected.monitorCharacteristicForService(
          HEART_RATE_SERVICE,
          HEART_RATE_MEASUREMENT,
          onMeasurement,
        )
        setDeviceName(device.name ?? device.localName ?? 'Heart Rate Monitor')
        setStatus('connected')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Connection failed'
        setError(msg)
        cleanup()
      }
    },
    [cleanup, onMeasurement],
  )

  const connect = useCallback(async () => {
    if (!supported || !manager) return
    setError(null)
    setStatus('connecting')

    const ok = await ensureAndroidPermissions()
    if (!ok) {
      setError('Bluetooth permission denied')
      setStatus('disconnected')
      return
    }

    const mgr = manager
    // Web Bluetooth showed a native chooser; ble-plx requires us to scan. We
    // connect to the first device advertising the Heart Rate service.
    mgr.startDeviceScan([HEART_RATE_SERVICE], null, (err, device) => {
      if (err) {
        mgr.stopDeviceScan()
        if (scanTimer.current) clearTimeout(scanTimer.current)
        setError(err.message)
        setStatus('disconnected')
        return
      }
      if (device) {
        mgr.stopDeviceScan()
        if (scanTimer.current) clearTimeout(scanTimer.current)
        void connectToDevice(device)
      }
    })

    scanTimer.current = setTimeout(() => {
      mgr.stopDeviceScan()
      setStatus(prev => {
        if (prev === 'connecting') {
          setError('No heart rate sensor found')
          return 'disconnected'
        }
        return prev
      })
    }, SCAN_TIMEOUT_MS)
  }, [supported, connectToDevice])

  const disconnect = useCallback(() => {
    if (scanTimer.current) clearTimeout(scanTimer.current)
    const device = deviceRef.current
    if (device) {
      device.cancelConnection().catch(() => {})
    }
    deviceRef.current = null
    cleanup()
  }, [cleanup])

  // Tear down any active connection when the hook unmounts.
  useEffect(() => {
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current)
      monitorRef.current?.remove()
      disconnectRef.current?.remove()
      deviceRef.current?.cancelConnection().catch(() => {})
    }
  }, [])

  return { status, hr, contact, deviceName, error, supported, connect, disconnect }
}
