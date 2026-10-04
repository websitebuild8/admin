import 'dart:math';

import 'mobile_api.dart';
import 'models.dart';

class PlaceSuggestion {
  final String id, label;
  const PlaceSuggestion(this.id, this.label);
}

class ResolvedPlace {
  final GeoPoint point;
  final Map<String, dynamic>? google;
  const ResolvedPlace(this.point, {this.google});
}

abstract interface class PlacesLookup {
  Future<List<PlaceSuggestion>> search(
    String input,
    String area,
    String session,
  );
  Future<ResolvedPlace> resolve(String id, String area, String session);
}

class MobilePlacesLookup implements PlacesLookup {
  final MobileApi api;
  const MobilePlacesLookup(this.api);
  @override
  Future<List<PlaceSuggestion>> search(
    String input,
    String area,
    String session,
  ) async {
    final v = await api.request(
      'places',
      data: {
        'action': 'search',
        'input': input,
        'area': area,
        'sessionToken': session,
      },
    );
    return (v['suggestions'] as List)
        .map((s) => PlaceSuggestion(s['placeId'], s['label']))
        .toList();
  }

  @override
  Future<ResolvedPlace> resolve(String id, String area, String session) async {
    final v = await api.request(
      'places',
      data: {
        'action': 'resolve',
        'placeId': id,
        'area': area,
        'sessionToken': session,
      },
    );
    final point = GeoPoint(
      (v['latitude'] as num).toDouble(),
      (v['longitude'] as num).toDouble(),
    );
    if (!ServiceArea.named(area).contains(point)) {
      throw ApiFailure('Choose a building in $area.');
    }
    return ResolvedPlace(point, google: Map<String, dynamic>.from(v['google']));
  }
}

String newPlacesSession() {
  final random = Random.secure(),
      bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
