import Foundation

@objc public final class MapStore: NSObject {
  @objc public static let shared = MapStore()

  /// Maps run to gigabytes. They live outside iCloud backup and are downloaded again on a new phone.
  /// `Library` has no space in its path, so `pmtiles://file://` URLs need no escaping.
  @objc public var directory: URL {
    let root = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
    var folder = root.appendingPathComponent("NeivMaps", isDirectory: true)
    if !FileManager.default.fileExists(atPath: folder.path) {
      try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? folder.setResourceValues(values)
    }
    return folder
  }

  @objc public func saveText(_ name: String, contents: String) -> Bool {
    guard let url = fileURL(name) else { return false }
    do {
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try contents.write(to: url, atomically: true, encoding: .utf8)
      return true
    } catch {
      return false
    }
  }

  @objc public func readText(_ name: String) -> String? {
    guard let url = fileURL(name) else { return nil }
    return try? String(contentsOf: url, encoding: .utf8)
  }

  @objc public func remove(_ name: String) -> Bool {
    guard let url = fileURL(name) else { return false }
    do {
      try FileManager.default.removeItem(at: url)
      return true
    } catch {
      return false
    }
  }

  @objc public func fileBytes(_ name: String) -> Double {
    guard let url = fileURL(name),
          let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
    else {
      return -1
    }
    return size.doubleValue
  }

  /// Relative names may hold folders (`sprites/ofm@2x.png`), never `..`.
  @objc public func fileURL(_ name: String) -> URL? {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- /@")
    guard !name.isEmpty, !name.hasPrefix("/"), name.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
      return nil
    }
    let parts = name.split(separator: "/", omittingEmptySubsequences: false)
    guard parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
      return nil
    }
    return directory.appendingPathComponent(name)
  }
}
