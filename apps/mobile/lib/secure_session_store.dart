import 'dart:convert';

import 'package:clerk_auth/clerk_auth.dart' as clerk;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Authentication persistence lives in Keychain/Android encrypted storage.
/// Neither bearer tokens nor Clerk's client token are written to preferences.
class SecureSessionStore implements clerk.Persistor {
  final FlutterSecureStorage storage;
  SecureSessionStore({this.storage = const FlutterSecureStorage()});
  String _key(String key) => 'igo.clerk.$key';
  @override
  Future<void> initialize() async {}
  @override
  void terminate() {}
  @override
  Future<T?> read<T>(String key) async {
    final value = await storage.read(key: _key(key));
    if (value == null) return null;
    try {
      return jsonDecode(value) as T?;
    } on FormatException {
      await delete(key);
      return null;
    }
  }

  @override
  Future<void> write<T>(String key, T value) =>
      storage.write(key: _key(key), value: jsonEncode(value));
  @override
  Future<void> delete(String key) => storage.delete(key: _key(key));
}
