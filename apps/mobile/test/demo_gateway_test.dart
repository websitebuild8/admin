import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:igo_mobile/demo_app.dart';
import 'package:igo_mobile/live_app.dart';
import 'package:igo_mobile/mobile_api.dart';

void main() {
  test(
    'demo keys route only to the sandbox, including role operations',
    () async {
      final paths = <String>[];
      final api = MobileApi.demo(
        baseUrl: 'https://igo.example',
        key: 'demo-test-key',
        role: 'rider',
        client: MockClient((r) async {
          paths.add(r.url.path);
          expect(r.headers['X-iGO-Demo-Role'], 'rider');
          expect(r.headers['Authorization'], 'Bearer demo-test-key');
          return http.Response('{}', 200);
        }),
      );
      await api.request('account');
      await api.request(
        'operations',
        operations: true,
        data: {'type': 'delivery'},
      );
      expect(paths, [
        '/api/demo/mobile/account',
        '/api/demo/mobile/operations',
      ]);
      api.close();
    },
  );
  for (final outcome in ['Approved', 'Declined', 'Cancelled']) {
    testWidgets(
      'demo checkout $outcome uses no card fields and submits only on approval',
      (tester) async {
        tester.view.physicalSize = const Size(430, 1900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final calls = <String>[];
        bool? placed;
        final api = MobileApi.demo(
          baseUrl: 'https://igo.example',
          key: 'demo-test-key',
          role: 'customer',
          client: MockClient((r) async {
            final resource = r.url.path.split('/').last;
            calls.add(resource);
            Object result;
            switch (resource) {
              case 'account':
                result = {
                  'demo': true,
                  'demoCheckoutEnabled': true,
                  'addresses': [
                    {
                      'id': 'address',
                      'kind': 'delivery',
                      'area': 'Malé',
                      'building': 'Demo entrance',
                      'latitude': 4.1755,
                      'longitude': 73.5093,
                    },
                  ],
                };
              case 'quote':
                result = {
                  'id': 'quote',
                  'demo': true,
                  'amount': 7000,
                  'snapshot': {'subtotal': 4500, 'deliveryFee': 2500},
                };
              case 'checkout':
                expect(jsonDecode(r.body), {'quoteId': 'quote'});
                result = {
                  'id': 'attempt',
                  'demo': true,
                  'status': 'Pending',
                  'amount': 7000,
                };
              case 'demo-payment':
                expect(jsonDecode(r.body), {
                  'attemptId': 'attempt',
                  'outcome': outcome,
                });
                result = {
                  'id': 'attempt',
                  'demo': true,
                  'status': outcome,
                  'orderId': outcome == 'Approved' ? 'DEMO-ORDER' : null,
                };
              default:
                throw StateError('Unexpected request');
            }
            return http.Response(jsonEncode(result), 200);
          }),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () async {
                    placed = await Navigator.push<bool>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => LiveCheckout(
                          api: api,
                          restaurant: {'id': 'restaurant'},
                          cart: [
                            {
                              'id': 'coffee',
                              'name': 'Coffee',
                              'price': 4500,
                              'quantity': 1,
                            },
                          ],
                          refreshAccount: () async {},
                        ),
                      ),
                    );
                  },
                  child: const Text('Open cart'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open cart'));
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Continue to demo bank'),
              )
              .onPressed,
          isNull,
        );
        await tester.tap(find.text('Review total'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Continue to demo bank'));
        await tester.pumpAndSettle();
        expect(find.text('iGO Demo Bank'), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(calls, ['account', 'quote', 'checkout']);
        await tester.tap(
          find.text(
            {
              'Approved': 'Simulate approval',
              'Declined': 'Simulate decline',
              'Cancelled': 'Cancel demo payment',
            }[outcome]!,
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Demo payment ${outcome.toLowerCase()}'),
          findsOneWidget,
        );
        expect(calls.where((r) => r == 'demo-payment').length, 1);
        await tester.tap(
          find.text(
            outcome == 'Approved' ? 'Continue to orders' : 'Return to cart',
          ),
        );
        await tester.pumpAndSettle();
        if (outcome == 'Approved') {
          expect(placed, true);
          expect(find.text('Open cart'), findsOneWidget);
        } else {
          expect(placed, isNull);
          expect(
            tester
                .widget<FilledButton>(
                  find.widgetWithText(FilledButton, 'Continue to demo bank'),
                )
                .onPressed,
            isNull,
          );
        }
        await tester.pumpWidget(const SizedBox());
        api.close();
      },
    );
  }
  testWidgets('a failed demo bank request cannot show an approval receipt', (
    tester,
  ) async {
    final api = MobileApi.demo(
      baseUrl: 'https://igo.example',
      key: 'demo-test-key',
      role: 'customer',
      client: MockClient(
        (r) async => http.Response('{"error":"Demo session expired."}', 401),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: DemoBankPage(
          api: api,
          attempt: {'id': 'attempt', 'status': 'Pending', 'amount': 7000},
        ),
      ),
    );
    await tester.tap(find.text('Simulate approval'));
    await tester.pumpAndSettle();
    expect(find.text('Demo session expired.'), findsOneWidget);
    expect(find.text('Continue to orders'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
}
