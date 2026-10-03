import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiFailure implements Exception {
  final String message;
  final int? status;
  const ApiFailure(this.message, [this.status]);
  @override
  String toString() => message;
}

class MobileApi {
  final Uri base;
  final Future<String> Function() token;
  final http.Client _client;
  MobileApi({required String baseUrl, required this.token, http.Client? client})
    : base = Uri.parse(baseUrl),
      _client = client ?? http.Client() {
    final developmentHost = [
      'localhost',
      '127.0.0.1',
      '10.0.2.2',
    ].contains(base.host);
    if (base.userInfo.isNotEmpty ||
        base.query.isNotEmpty ||
        base.fragment.isNotEmpty ||
        (base.scheme != 'https' &&
            (kReleaseMode || base.scheme != 'http' || !developmentHost))) {
      throw const ApiFailure('Use a secure iGO server address.');
    }
  }
  Future<Map<String, dynamic>> request(
    String resource, {
    Map<String, dynamic>? data,
    bool operations = false,
    int page = 1,
    String? restaurantId,
  }) async {
    final uri = base
        .resolve(
          operations ? '/api/mobile/operations' : '/api/mobile/v1/$resource',
        )
        .replace(
          queryParameters: {
            if (data == null) 'page': '$page',
            'restaurantId': ?restaurantId,
          },
        );
    try {
      final jwt = await token();
      if (jwt.isEmpty) throw const ApiFailure('Sign in again.', 401);
      final headers = {
        'Authorization': 'Bearer $jwt',
        'Accept': 'application/json',
        if (data != null) 'Content-Type': 'application/json',
      };
      final response =
          await (data == null
                  ? _client.get(uri, headers: headers)
                  : _client.post(uri, headers: headers, body: jsonEncode(data)))
              .timeout(const Duration(seconds: 20));
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const ApiFailure('The server returned an unexpected response.');
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ApiFailure(
          decoded['error'] is String
              ? decoded['error']
              : 'Could not complete this request.',
          response.statusCode,
        );
      }
      return decoded;
    } on ApiFailure {
      rethrow;
    } on TimeoutException {
      throw const ApiFailure('Connection timed out. Please try again.');
    } catch (_) {
      throw const ApiFailure(
        'Could not connect to iGO. Check your connection and try again.',
      );
    }
  }

  void close() => _client.close();
}
