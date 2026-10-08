import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as imaging;
import 'package:igo_mobile/delivery_widgets.dart';
import 'package:igo_mobile/food_photo.dart';
import 'package:igo_mobile/mobile_api.dart';

Uint8List fixture() {
  final image = imaging.Image(width: 400, height: 200, numChannels: 3);
  imaging.fill(image, color: imaging.ColorRgb8(240, 10, 10));
  imaging.fillRect(
    image,
    x1: 200,
    y1: 0,
    x2: 399,
    y2: 199,
    color: imaging.ColorRgb8(10, 10, 240),
  );
  return Uint8List.fromList(imaging.encodePng(image));
}

const fields = <String, dynamic>{
  'id': '8b004daa-4616-4f93-a83d-000000000010',
  'name': 'Cake',
  'description': '',
  'category': 'Desserts',
  'price': 2575,
  'available': true,
};
const asset = <String, dynamic>{
  'id': '8b004daa-4616-4f93-a83d-000000000020',
  'url': 'https://test.supabase.co/storage/v1/object/public/igo-menu-images/cover.webp',
  'thumbnailUrl': 'https://test.supabase.co/thumb.webp',
  'width': 200,
  'height': 200,
};

Future<void> openEditor(WidgetTester tester, MenuEditorPage editor) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => editor),
            ),
            child: const Text('Open editor'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open editor'));
  await tester.pumpAndSettle();
}

Future<void> tapPhotoAction(WidgetTester tester, String key) async {
  await tester.runAsync(() async {
    await tester.tap(find.byKey(ValueKey(key)));
    await Future<void>.delayed(const Duration(milliseconds: 300));
  });
  await tester.pumpAndSettle();
}

void main() {
  test('crop uses selected pixels and handles clockwise rotation', () {
    final photo = prepareFoodPhoto(fixture());
    final cropped = imaging.decodeJpg(
      cropFoodPhoto(
        FoodCrop(photo: photo, turns: 0, left: .5, top: 0, extent: 1),
      ),
    )!;
    expect(cropped.width, 200);
    expect(cropped.height, 200);
    expect(cropped.getPixel(100, 100).b, greaterThan(200));
    final rotated = imaging.decodeJpg(
      cropFoodPhoto(
        FoodCrop(photo: photo, turns: 1, left: 0, top: .5, extent: 1),
      ),
    )!;
    expect(rotated.getPixel(100, 100).b, greaterThan(200));
    expect(
      prepareFoodPhoto(
        Uint8List.fromList(
          imaging.encodePng(imaging.Image(width: 2049, height: 129)),
        ),
      ).width,
      2048,
    );
    expect(
      () => prepareFoodPhoto(Uint8List.fromList([1, 2, 3])),
      throwsException,
    );
  });
  testWidgets(
    'cropped photo uploads once; retry after menu failure preserves the staged asset',
    (tester) async {
      int uploads = 0, saves = 0;
      final discarded = <String>[];
      Map<String, dynamic>? submitted;
      await openEditor(
        tester,
        MenuEditorPage(
          item: fields,
          pickPhoto: () async => fixture(),
          onUpload: (bytes) async {
            uploads++;
            expect(
              imaging.decodeJpg(bytes)!.width,
              imaging.decodeJpg(bytes)!.height,
            );
            return asset;
          },
          onDiscard: (id) async => discarded.add(id),
          onSave: (v) async {
            saves++;
            submitted = v;
            if (saves == 1) throw Exception('Try saving again.');
          },
        ),
      );
      await tapPhotoAction(tester, 'choose-menu-photo');
      expect(find.byType(FoodPhotoEditor), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('rotate-food-photo')));
      await tester.pump();
      await tapPhotoAction(tester, 'use-food-photo');
      expect(find.byType(FoodPhotoEditor), findsNothing);
      await tester.tap(find.byKey(const ValueKey('save-menu-item')));
      await tester.pumpAndSettle();
      expect(uploads, 1);
      expect(saves, 1);
      expect(submitted?['imageId'], asset['id']);
      await tester.tap(find.byKey(const ValueKey('save-menu-item')));
      await tester.pumpAndSettle();
      expect(uploads, 1);
      expect(saves, 2);
      expect(discarded, isEmpty);
      expect(find.text('Open editor'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'cancelling after failed save discards only the newly staged photo',
    (tester) async {
      final discarded = <String>[];
      await openEditor(
        tester,
        MenuEditorPage(
          item: fields,
          pickPhoto: () async => fixture(),
          onUpload: (_) async => asset,
          onDiscard: (id) async => discarded.add(id),
          onSave: (_) async => throw Exception('Connection failed.'),
        ),
      );
      await tapPhotoAction(tester, 'choose-menu-photo');
      await tapPhotoAction(tester, 'use-food-photo');
      await tester.tap(find.byKey(const ValueKey('save-menu-item')));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      expect(discarded, [asset['id']]);
    },
  );
  testWidgets('removing an existing photo waits for Save and does not upload', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    int uploads = 0;
    await openEditor(
      tester,
      MenuEditorPage(
        item: {...fields, 'image': asset},
        onUpload: (_) async {
          uploads++;
          return asset;
        },
        onSave: (v) async => saved = v,
      ),
    );
    await tester.tap(find.byKey(const ValueKey('remove-menu-photo')));
    await tester.pump();
    expect(saved, isNull);
    await tester.tap(find.byKey(const ValueKey('save-menu-item')));
    await tester.pumpAndSettle();
    expect(saved!.containsKey('imageId'), isTrue);
    expect(saved!['imageId'], isNull);
    expect(uploads, 0);
    expect(tester.takeException(), isNull);
  });
  testWidgets('upload failure retains edits and never submits the menu item', (
    tester,
  ) async {
    int saves = 0;
    await openEditor(
      tester,
      MenuEditorPage(
        item: fields,
        pickPhoto: () async => fixture(),
        onUpload: (_) async => throw const ApiFailure('Photo upload failed.'),
        onSave: (_) async {
          saves++;
        },
      ),
    );
    await tapPhotoAction(tester, 'choose-menu-photo');
    await tapPhotoAction(tester, 'use-food-photo');
    await tester.tap(find.byKey(const ValueKey('save-menu-item')));
    await tester.pumpAndSettle();
    expect(saves, 0);
    expect(find.text('Photo upload failed.'), findsOneWidget);
    expect(find.text('Replace photo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  test('binary uploads use the iGO backend and role headers, without Supabase credentials', () async {
    for (final demo in [false, true]) {
      final api = MobileApi(
        baseUrl: 'https://igo.example',
        token: () async => demo ? 'demo-key' : 'clerk-token',
        demoRole: demo ? 'restaurant' : null,
        client: MockClient((request) async {
          expect(
            request.url.path,
            demo ? '/api/demo/mobile/menu-image' : '/api/mobile/v1/menu-image',
          );
          expect(request.headers['Content-Type'], 'image/jpeg');
          expect(
            request.headers['Authorization'],
            'Bearer ${demo ? 'demo-key' : 'clerk-token'}',
          );
          expect(
            request.headers['X-iGO-Demo-Role'],
            demo ? 'restaurant' : null,
          );
          expect(request.headers.containsKey('apikey'), isFalse);
          expect(request.bodyBytes, [1, 2, 3]);
          return http.Response('{"image":{"id":"photo-id"}}', 200);
        }),
      );
      expect(
        (await api.uploadMenuImage(Uint8List.fromList([1, 2, 3])))['id'],
        'photo-id',
      );
      api.close();
    }
  });
}
