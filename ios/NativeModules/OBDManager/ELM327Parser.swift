import Foundation

enum ELM327Parser {
  static func parseMode01(_ raw: String, pid: UInt8) -> Double? {
    let compact = sanitize(raw)
    if compact.contains("NODATA") || compact.contains("ERROR") || compact.contains("UNABLE") || compact.contains("STOPPED") {
      return nil
    }
    let marker = String(format: "41%02X", pid)
    guard let range = compact.range(of: marker) else { return nil }
    let bytes = hexBytes(String(compact[range.upperBound...]))
    switch pid {
    case 0x0D:
      guard let value = bytes.first else { return nil }
      return Double(value)
    case 0x0C:
      guard bytes.count >= 2 else { return nil }
      return Double(Int(bytes[0]) * 256 + Int(bytes[1])) / 4
    case 0x04, 0x11:
      guard let value = bytes.first else { return nil }
      return Double(value) * 100 / 255
    case 0x05:
      guard let value = bytes.first else { return nil }
      return Double(value) - 40
    default:
      return nil
    }
  }

  static func parseVoltage(_ raw: String) -> Double? {
    let filtered = raw.uppercased().replacingOccurrences(of: "SEARCHING...", with: "")
    guard let match = filtered.range(of: #"(-?\d+(\.\d+)?)\s*V"#, options: .regularExpression) else {
      return nil
    }
    let slice = filtered[match].replacingOccurrences(of: "V", with: "").trimmingCharacters(in: .whitespaces)
    return Double(slice)
  }

  private static func sanitize(_ raw: String) -> String {
    raw.uppercased()
      .replacingOccurrences(of: "SEARCHING...", with: "")
      .replacingOccurrences(of: " ", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: ">", with: "")
  }

  private static func hexBytes(_ text: String) -> [UInt8] {
    let scalars = Array(text)
    var bytes: [UInt8] = []
    var index = 0
    while index + 1 < scalars.count {
      let pair = String(scalars[index...index + 1])
      guard let value = UInt8(pair, radix: 16) else { break }
      bytes.append(value)
      index += 2
      if bytes.count == 4 { break }
    }
    return bytes
  }
}
