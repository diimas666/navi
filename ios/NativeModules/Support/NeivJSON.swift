import Foundation

enum NeivJSON {
  static func bool(_ input: NSDictionary, _ key: String) -> Bool {
    (input[key] as? NSNumber)?.boolValue ?? false
  }

  static func double(_ input: NSDictionary, _ key: String) -> Double {
    (input[key] as? NSNumber)?.doubleValue ?? 0
  }

  static func string(_ input: NSDictionary, _ key: String) -> String {
    input[key] as? String ?? ""
  }

  static func payload(_ values: [String: Any]) -> NSDictionary {
    values as NSDictionary
  }
}
