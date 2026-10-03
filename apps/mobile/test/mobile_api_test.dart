import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:igo_mobile/mobile_api.dart';
import 'package:igo_mobile/live_app.dart';

void main() {
  test(
    'mobile API sends a fresh bearer session and preserves integer quantities',
    () async {
      var tokenRequests = 0;
      final api = MobileApi(
        baseUrl: 'https://igo.example',
        token: () async => 'session-${++tokenRequests}',
        client: MockClient((request) async {
          expect(
            request.headers['Authorization'],
            'Bearer session-$tokenRequests',
          );
          expect(request.url.path, '/api/mobile/v1/quote');
          final body = jsonDecode(request.body) as Map;
          expect(body['items'][0]['quantity'], 2);
          expect(body.containsKey('paid'), false);
          return http.Response('{"amount":11500}', 200);
        }),
      );
      final body = {
        'restaurantId': 'restaurant',
        'addressId': 'address',
        'items': [
          {'id': 'coffee', 'quantity': 2},
        ],
      };
      await api.request('quote', data: body);
      await api.request('quote', data: body);
      expect(tokenRequests, 2);
      api.close();
    },
  );
  test('API refuses insecure remote URLs and credentials in URLs', () {
    for (final url in [
      'http://igo.example',
      'https://user:password@igo.example',
      'https://igo.example?secret=1',
    ]) {
      expect(
        () => MobileApi(baseUrl: url, token: () async => 'token'),
        throwsA(isA<ApiFailure>()),
      );
    }
  });
  test(
    'expired session and HTML redirect never look like successful account data',
    () async {
      for (final response in [
        http.Response('{"error":"Sign in again."}', 401),
        http.Response('<html>sign in</html>', 200),
      ]) {
        final api = MobileApi(
          baseUrl: 'https://igo.example',
          token: () async => 'test',
          client: MockClient((_) async => response),
        );
        await expectLater(api.request('account'), throwsA(isA<ApiFailure>()));
        api.close();
      }
    },
  );
  testWidgets(
    'live customer has no fictional catalog and cannot switch their role',
    (tester) async {
      final api = MobileApi(
        baseUrl: 'https://igo.example',
        token: () async => 'test',
        client: MockClient(
          (request) async => http.Response(
            jsonEncode(
              request.url.path.endsWith('operations')
                  ? {
                      'orders': [],
                      'offers': [],
                      'notifications': [],
                      'total': 0,
                      'page': 1,
                    }
                  : {'items': [], 'total': 0, 'page': 1},
            ),
            200,
          ),
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: LiveWorkspace(
            api: api,
            account: {
              'name': 'Aisha',
              'access': {'role': 'customer'},
              'addresses': [],
            },
            refreshAccount: () async {},
            signOut: () async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Restaurants will appear here after approval and menu setup.',
        ),
        findsOneWidget,
      );
      expect(find.text('The Cafe'), findsNothing);
      expect(find.text('Change experience'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
  testWidgets('live checkout stays disabled after a valid server quote', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(430, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = MobileApi(
      baseUrl: 'https://igo.example',
      token: () async => 'test',
      client: MockClient(
        (request) async => http.Response(
          jsonEncode(
            request.url.path.endsWith('account')
                ? {
                    'addresses': [
                      {
                        'id': 'address',
                        'kind': 'delivery',
                        'area': 'Malé',
                        'building': 'Example building',
                        'unit': '2A',
                        'instructions': 'East door',
                        'latitude': 4.1755,
                        'longitude': 73.5093,
                      },
                    ],
                  }
                : {
                    'id': 'quote',
                    'amount': 7000,
                    'snapshot': {'subtotal': 4500, 'deliveryFee': 2500},
                  },
          ),
          200,
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: LiveCheckout(
          api: api,
          restaurant: {'id': 'restaurant'},
          cart: [
            {'id': 'coffee', 'name': 'Coffee', 'price': 4500, 'quantity': 1},
          ],
          refreshAccount: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Review total'));
    await tester.pumpAndSettle();
    expect(find.text('Total: MVR 70.00'), findsOneWidget);
    final pay = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Pay by card & submit order'),
    );
    expect(pay.onPressed, isNull);
    expect(
      find.text(
        'Payment collection is disabled. No order will be submitted from this screen yet.',
      ),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
}
