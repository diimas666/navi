import Foundation

@objc public final class MapStore: NSObject {
  @objc public static let shared = MapStore()

  private var directory: URL {
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let folder = root.appendingPathComponent("NeivMaps", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder
  }

  @objc public func saveText(_ name: String, contents: String) -> Bool {
    guard let url = fileURL(name) else { return false }
    do {
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

  private func fileURL(_ name: String) -> URL? {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
    guard !name.isEmpty, name.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
      return nil
    }
    return directory.appendingPathComponent(name)
  }
}
