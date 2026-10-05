import CoreBluetooth
import Foundation
import Network
import Darwin

/// ELM327 через Bluetooth LE або Wi-Fi TCP (типовий порт 35000).
/// Непідтриманий PID лишається порожнім — значення не вигадуються.
@objc public final class OBDManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  @objc public static let shared = OBDManager()

  private var central: CBCentralManager?
  private var peripherals: [String: CBPeripheral] = [:]
  private var peripheral: CBPeripheral?
  private var setupStarted = false
  private var writeCharacteristic: CBCharacteristic?
  private var wifi: NWConnection?
  private var devices: [String: NSDictionary] = [:]
  private var pending: [(command: String, timeout: TimeInterval, completion: (String?) -> Void)] = []
  private var buffer = ""
  private var busy = false
  private var activeCompletion: ((String?) -> Void)?
  private var timeoutWork: DispatchWorkItem?
  private var pollTimer: DispatchSourceTimer?
  private var pollTick = 0
  private var secondaryIndex = 0
  private let secondary = ["010C", "0104", "0111", "0105", "ATRV"]
  private var speedKmh: Double?
  private var rpm: Double?
  private var engineLoad: Double?
  private var throttle: Double?
  private var coolant: Double?
  private var voltage: Double?
  private var updatedAt: [String: TimeInterval] = [:]
  private var transport = "ble"
  private var wifiHost = "192.168.0.10"
  private var wifiPort: UInt16 = 35000
  private var connectCompletion: ((Bool) -> Void)?
  private var state = "idle"
  private var stateMessage = ""
  private var scanToken = 0
  private var probes: [NWConnection] = []

  @objc public var onDevice: ((NSDictionary) -> Void)?
  @objc public var onState: ((NSDictionary) -> Void)?
  @objc public var onData: ((NSDictionary) -> Void)?

  @objc public func setTransport(_ value: String) {
    transport = value == "wifi" ? "wifi" : "ble"
  }

  @objc public func setWifiEndpoint(_ host: String, port: Double) {
    wifiHost = host
    wifiPort = UInt16(port)
  }

  @objc public func connectionState() -> String {
    state
  }

  @objc public func deviceList() -> [NSDictionary] {
    Array(devices.values)
  }

  @objc public func latest() -> NSDictionary {
    snapshot()
  }

  @objc public func startScan() {
    if transport == "wifi" {
      scanToken += 1
      let token = scanToken
      central?.stopScan()
      cancelProbes()
      devices.removeAll()
      publishWifi(wifiHost)
      publishState("scanning", "Шукаємо Wi-Fi адаптер")
      let hosts = wifiCandidates().filter { $0 != wifiHost }
      if hosts.isEmpty {
        publishState("idle", "")
        return
      }
      let group = DispatchGroup()
      for host in hosts {
        group.enter()
        probePort(host, token: token) { open in
          if token == self.scanToken && open {
            self.publishWifi(host)
          }
          group.leave()
        }
      }
      group.notify(queue: .main) {
        if token == self.scanToken && self.state == "scanning" {
          self.publishState("idle", "")
        }
      }
      return
    }
    cancelProbes()
    devices = devices.filter { ($0.value["transport"] as? String) == "ble" }
    ensureCentral()
    publishState("scanning", "Шукаємо адаптери")
    if central?.state == .poweredOn {
      central?.scanForPeripherals(withServices: nil, options: nil)
    }
  }

  @objc public func stopScan() {
    scanToken += 1
    cancelProbes()
    central?.stopScan()
    if state == "scanning" {
      publishState("idle", "")
    }
  }

  @objc public func connect(_ deviceId: String, completion: @escaping (Bool) -> Void) {
    resetLink()
    connectCompletion = completion
    publishState("connecting", "Підключення")
    if deviceId.hasPrefix("wifi:") || transport == "wifi" {
      applyWifiIdentity(deviceId)
      connectWifi()
      return
    }
    guard let found = peripherals[deviceId] else {
      publishState("failed", "Адаптер не знайдено")
      completion(false)
      connectCompletion = nil
      return
    }
    peripheral = found
    found.delegate = self
    central?.stopScan()
    central?.connect(found, options: nil)
  }

  @objc public func disconnect(_ completion: @escaping () -> Void) {
    resetLink()
    publishState("disconnected", "Відключено")
    completion()
  }

  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn, state == "scanning" {
      central.scanForPeripherals(withServices: nil, options: nil)
    } else if central.state == .unauthorized {
      publishState("failed", "Немає дозволу Bluetooth")
    } else if central.state == .poweredOff {
      publishState("failed", "Bluetooth вимкнено")
    }
  }

  public func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
    let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]
    guard isAdapter(name, services) else { return }
    let device: NSDictionary = [
      "id": peripheral.identifier.uuidString,
      "name": name.isEmpty ? "OBD Adapter" : name,
      "transport": "ble",
      "rssi": RSSI.intValue,
    ]
    devices[peripheral.identifier.uuidString] = device
    peripherals[peripheral.identifier.uuidString] = peripheral
    onDevice?(device)
  }

  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    publishState("initializing", "Читаємо адаптер")
    peripheral.discoverServices(nil)
  }

  public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    publishState("failed", error?.localizedDescription ?? "Не вдалося підключитися")
    finishConnect(false)
  }

  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    peripheral.services?.forEach { peripheral.discoverCharacteristics(nil, for: $0) }
  }

  public func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    service.characteristics?.forEach { characteristic in
      if characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate) {
        peripheral.setNotifyValue(true, for: characteristic)
      }
      if characteristic.properties.contains(.write) || characteristic.properties.contains(.writeWithoutResponse) {
        writeCharacteristic = characteristic
      }
    }
    tryStartSetup()
  }

  public func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateNotificationStateFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    tryStartSetup()
  }

  public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard let data = characteristic.value, let text = String(data: data, encoding: .utf8) else { return }
    accept(text)
  }

  private func applyWifiIdentity(_ deviceId: String) {
    let parts = deviceId.split(separator: ":")
    guard parts.count >= 3 else {
      return
    }
    wifiHost = String(parts[1])
    if let port = UInt16(parts[2]) {
      wifiPort = port
    }
  }

  private func publishWifi(_ host: String) {
    let id = "wifi:\(host):\(wifiPort)"
    let device: NSDictionary = [
      "id": id,
      "name": "OBD Wi-Fi \(host)",
      "transport": "wifi",
      "rssi": 0,
    ]
    devices[id] = device
    onDevice?(device)
  }

  private func cancelProbes() {
    probes.forEach { $0.cancel() }
    probes.removeAll()
  }

  private func wifiCandidates() -> [String] {
    var hosts = [wifiHost, "192.168.0.10", "192.168.0.11", "192.168.1.10"]
    if let address = localIPv4() {
      let parts = address.split(separator: ".")
      if parts.count == 4 {
        let prefix = parts.prefix(3).joined(separator: ".")
        hosts.append("\(prefix).10")
        hosts.append("\(prefix).1")
      }
    }
    var seen = Set<String>()
    return hosts.filter { seen.insert($0).inserted }
  }

  private func localIPv4() -> String? {
    var pointer: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&pointer) == 0, let first = pointer else {
      return nil
    }
    defer { freeifaddrs(pointer) }
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let item = cursor {
      let interface = item.pointee
      if let addr = interface.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
        let name = String(cString: interface.ifa_name)
        if name == "en0" {
          var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
          return String(cString: host)
        }
      }
      cursor = interface.ifa_next
    }
    return nil
  }

  private func probePort(_ host: String, token: Int, done: @escaping (Bool) -> Void) {
    guard token == scanToken, let port = NWEndpoint.Port(rawValue: wifiPort) else {
      done(false)
      return
    }
    let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
    probes.append(connection)
    let gate = ProbeGate()
    let finish: (Bool) -> Void = { open in
      DispatchQueue.main.async {
        if gate.finished || token != self.scanToken {
          if !gate.finished {
            gate.finished = true
            connection.cancel()
            done(false)
          }
          return
        }
        gate.finished = true
        connection.cancel()
        done(open)
      }
    }
    connection.stateUpdateHandler = { status in
      switch status {
      case .ready:
        finish(true)
      case .failed, .cancelled:
        finish(false)
      default:
        break
      }
    }
    connection.start(queue: .global(qos: .utility))
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 1.4) {
      finish(false)
    }
  }

  private func connectWifi() {
    guard let port = NWEndpoint.Port(rawValue: wifiPort) else {
      finishConnect(false)
      return
    }
    let connection = NWConnection(host: NWEndpoint.Host(wifiHost), port: port, using: .tcp)
    wifi = connection
    connection.stateUpdateHandler = { [weak self] status in
      DispatchQueue.main.async {
        switch status {
        case .ready:
          self?.setupStarted = true
          self?.publishState("initializing", "Читаємо адаптер")
          self?.receiveWifi()
          self?.runSetup(0)
        case .failed:
          self?.publishState("failed", "Wi-Fi адаптер недоступний")
          self?.finishConnect(false)
        default:
          break
        }
      }
    }
    connection.start(queue: .main)
  }

  private func receiveWifi() {
    guard let connection = wifi else { return }
    connection.receive(minimumIncompleteLength: 1, maximumLength: 512) { [weak self] data, _, complete, error in
      if let data, let text = String(data: data, encoding: .utf8) {
        DispatchQueue.main.async { self?.accept(text) }
      }
      if complete || error != nil {
        return
      }
      self?.receiveWifi()
    }
  }

  private func tryStartSetup() {
    guard writeCharacteristic != nil, state == "initializing", !setupStarted else { return }
    setupStarted = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
      guard let self, self.state == "initializing" else { return }
      self.runSetup(0)
    }
  }

  private func resetLink() {
    pollTimer?.cancel()
    pollTimer = nil
    timeoutWork?.cancel()
    timeoutWork = nil
    pending.removeAll()
    busy = false
    activeCompletion = nil
    buffer = ""
    setupStarted = false
    writeCharacteristic = nil
    if let peripheral {
      central?.cancelPeripheralConnection(peripheral)
    }
    peripheral = nil
    wifi?.cancel()
    wifi = nil
    clearReadings()
    onData?(snapshot())
  }

  private func runSetup(_ index: Int) {
    let commands = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"]
    if index >= commands.count {
      publishState("ready", "Адаптер готовий")
      startPolling()
      finishConnect(true)
      return
    }
    let command = commands[index]
    enqueue(command, timeout: command == "ATZ" ? 2.5 : 1.4) { [weak self] _ in
      self?.runSetup(index + 1)
    }
  }

  private func startPolling() {
    pollTimer?.cancel()
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 0.2, repeating: 0.25)
    timer.setEventHandler { [weak self] in
      self?.poll()
    }
    timer.resume()
    pollTimer = timer
  }

  private func poll() {
    guard state == "ready", !busy else { return }
    let command: String
    if pollTick % 3 == 0 {
      command = secondary[secondaryIndex % secondary.count]
      secondaryIndex += 1
    } else {
      command = "010D"
    }
    pollTick += 1
    enqueue(command, timeout: 1.2) { [weak self] response in
      self?.apply(command, response)
    }
  }

  private func apply(_ command: String, _ response: String?) {
    guard let response else { return }
    let now = Date().timeIntervalSince1970
    switch command {
    case "010D":
      speedKmh = ELM327Parser.parseMode01(response, pid: 0x0D)
      if speedKmh != nil { updatedAt["speed"] = now }
    case "010C":
      rpm = ELM327Parser.parseMode01(response, pid: 0x0C)
      if rpm != nil { updatedAt["rpm"] = now }
    case "0104":
      engineLoad = ELM327Parser.parseMode01(response, pid: 0x04)
      if engineLoad != nil { updatedAt["load"] = now }
    case "0111":
      throttle = ELM327Parser.parseMode01(response, pid: 0x11)
      if throttle != nil { updatedAt["throttle"] = now }
    case "0105":
      coolant = ELM327Parser.parseMode01(response, pid: 0x05)
      if coolant != nil { updatedAt["coolant"] = now }
    case "ATRV":
      voltage = ELM327Parser.parseVoltage(response)
      if voltage != nil { updatedAt["voltage"] = now }
    default:
      break
    }
    let snap = snapshot()
    onData?(snap)
  }

  private func enqueue(_ command: String, timeout: TimeInterval, completion: @escaping (String?) -> Void) {
    pending.append((command, timeout, completion))
    pump()
  }

  private func pump() {
    guard !busy, !pending.isEmpty else { return }
    let item = pending.removeFirst()
    busy = true
    buffer = ""
    activeCompletion = item.completion
    write(item.command + "\r")
    let work = DispatchWorkItem { [weak self] in
      self?.complete(nil)
    }
    timeoutWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + item.timeout, execute: work)
  }

  private func accept(_ text: String) {
    buffer += text
    guard buffer.contains(">") else { return }
    let response = buffer
    buffer = ""
    complete(response)
  }

  private func complete(_ response: String?) {
    timeoutWork?.cancel()
    let completion = activeCompletion
    activeCompletion = nil
    busy = false
    completion?(response)
    pump()
  }

  private func write(_ text: String) {
    guard let data = text.data(using: .utf8) else { return }
    if let wifi, wifi.state == .ready {
      wifi.send(content: data, completion: .contentProcessed { _ in })
      return
    }
    guard let peripheral, let characteristic = writeCharacteristic else { return }
    let type: CBCharacteristicWriteType = characteristic.properties.contains(.write) ? .withResponse : .withoutResponse
    peripheral.writeValue(data, for: characteristic, type: type)
  }

  private func snapshot() -> NSDictionary {
    let now = Date().timeIntervalSince1970
    func fresh(_ key: String, _ value: Double?) -> Bool {
      guard value != nil, let at = updatedAt[key] else { return false }
      return now - at < 2.5
    }
    return NeivJSON.payload([
      "hasSpeed": fresh("speed", speedKmh),
      "speedKmh": speedKmh ?? 0,
      "hasRpm": fresh("rpm", rpm),
      "rpm": rpm ?? 0,
      "hasEngineLoad": fresh("load", engineLoad),
      "engineLoad": engineLoad ?? 0,
      "hasThrottle": fresh("throttle", throttle),
      "throttle": throttle ?? 0,
      "hasCoolant": fresh("coolant", coolant),
      "coolantC": coolant ?? 0,
      "hasVoltage": fresh("voltage", voltage),
      "voltage": voltage ?? 0,
      "timestamp": now * 1000,
    ])
  }

  private func clearReadings() {
    speedKmh = nil
    rpm = nil
    engineLoad = nil
    throttle = nil
    coolant = nil
    voltage = nil
    updatedAt.removeAll()
  }

  private func ensureCentral() {
    if central == nil {
      central = CBCentralManager(delegate: self, queue: .main)
    }
  }

  private func isAdapter(_ name: String, _ services: [CBUUID]?) -> Bool {
    let upper = name.uppercased()
    let tokens = ["OBD", "ELM", "VLINK", "VGATE", "OBDLINK", "VEEPEAK", "KONNWEI", "IOS-VLINK"]
    if tokens.contains(where: { upper.contains($0) }) { return true }
    let known: Set<String> = ["FFE0", "FFF0", "18F0"]
    return services?.contains(where: { known.contains($0.uuidString.uppercased()) }) ?? false
  }

  private func publishState(_ value: String, _ message: String) {
    state = value
    stateMessage = message
    onState?(["state": value, "message": message])
  }

  private func finishConnect(_ ok: Bool) {
    connectCompletion?(ok)
    connectCompletion = nil
  }
}

private final class ProbeGate {
  var finished = false
}
