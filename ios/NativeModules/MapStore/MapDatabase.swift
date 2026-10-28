import Foundation
import SQLite3

/// Read-only queries to region databases in the maps folder (system SQLite, no extra library).
/// Rows come back as a JSON array of arrays, in column order.
@objc public final class MapDatabase: NSObject {
  @objc public static let shared = MapDatabase()

  private let lock = NSLock()
  private var handles: [String: OpaquePointer] = [:]

  @objc public func query(_ name: String, sql: String, params: String) -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let db = open(name) else { return nil }
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      return nil
    }
    defer { sqlite3_finalize(statement) }
    let values = (try? JSONSerialization.jsonObject(with: Data(params.utf8))) as? [Any] ?? []
    let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    for (index, value) in values.enumerated() {
      let slot = Int32(index + 1)
      if let number = value as? NSNumber {
        if CFNumberIsFloatType(number) {
          sqlite3_bind_double(statement, slot, number.doubleValue)
        } else {
          sqlite3_bind_int64(statement, slot, number.int64Value)
        }
      } else if let text = value as? String {
        sqlite3_bind_text(statement, slot, text, -1, transient)
      } else {
        sqlite3_bind_null(statement, slot)
      }
    }
    var rows: [[Any]] = []
    let columns = sqlite3_column_count(statement)
    while sqlite3_step(statement) == SQLITE_ROW {
      var row: [Any] = []
      row.reserveCapacity(Int(columns))
      for column in 0..<columns {
        switch sqlite3_column_type(statement, column) {
        case SQLITE_INTEGER:
          row.append(sqlite3_column_int64(statement, column))
        case SQLITE_FLOAT:
          row.append(sqlite3_column_double(statement, column))
        case SQLITE_TEXT:
          if let textPtr = sqlite3_column_text(statement, column) {
            row.append(String(cString: textPtr))
          } else {
            row.append(NSNull())
          }
        default:
          row.append(NSNull())
        }
      }
      rows.append(row)
    }
    guard let data = try? JSONSerialization.data(withJSONObject: rows) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// A replaced or removed file must not keep a stale handle.
  @objc public func close(_ name: String) {
    lock.lock()
    defer { lock.unlock() }
    if let db = handles.removeValue(forKey: name) {
      sqlite3_close(db)
    }
  }

  private func open(_ name: String) -> OpaquePointer? {
    if let db = handles[name] {
      return db
    }
    guard let url = MapStore.shared.fileURL(name), FileManager.default.fileExists(atPath: url.path) else {
      return nil
    }
    var db: OpaquePointer?
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK, let db else {
      return nil
    }
    handles[name] = db
    return db
  }
}
