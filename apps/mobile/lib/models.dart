enum AppRole { customer, restaurant, rider }

class Dish {
  final String name, description, emoji;
  final int price;
  const Dish(this.name, this.description, this.emoji, this.price);
}

const menu = [
  Dish('Iced latte', 'Espresso, cold milk & a little happiness', '☕', 4500),
  Dish('Chocolate cake', 'Rich chocolate • baked fresh today', '🍰', 6000),
  Dish('Caramel latte', 'Smooth espresso with golden caramel', '☕', 4800),
];

String money(int laari) =>
    'MVR ${(laari / 100).toStringAsFixed(laari % 100 == 0 ? 0 : 2)}';

class Cart {
  final Map<int, int> quantities = {};
  PreviewAddress? deliveryAddress;
  int get count => quantities.values.fold(0, (a, b) => a + b);
  int get subtotal =>
      quantities.entries.fold(0, (a, e) => a + menu[e.key].price * e.value);
  int get deliveryFee => count == 0 ? 0 : 2500;
  int get total => subtotal + deliveryFee;
  void change(int index, int delta) {
    if (index < 0 || index >= menu.length) return;
    final next = (quantities[index] ?? 0) + delta;
    if (next <= 0) {
      quantities.remove(index);
    } else if (next <= 20) {
      quantities[index] = next;
    }
  }
}

Uri directions(double latitude, double longitude) {
  if (!latitude.isFinite ||
      !longitude.isFinite ||
      latitude.abs() > 90 ||
      longitude.abs() > 180) {
    throw ArgumentError('Invalid destination');
  }
  return Uri.https('www.google.com', '/maps/dir/', {
    'api': '1',
    'destination': '$latitude,$longitude',
    'travelmode': 'driving',
  });
}

class GeoPoint {
  final double latitude, longitude;
  const GeoPoint(this.latitude, this.longitude);

  bool get isValid =>
      latitude.isFinite &&
      longitude.isFinite &&
      latitude.abs() <= 90 &&
      longitude.abs() <= 180;

  String get label =>
      '${latitude.toStringAsFixed(6)}, ${longitude.toStringAsFixed(6)}';
  Uri get navigation => directions(latitude, longitude);
}

/// Approximate preview bounds, not surveyed service-zone polygons. The backend
/// must independently check approved coverage before accepting a real order.
class ServiceArea {
  final String name;
  final GeoPoint center, southWest, northEast;
  const ServiceArea(this.name, this.center, this.southWest, this.northEast);

  bool contains(GeoPoint point) =>
      point.isValid &&
      point.latitude >= southWest.latitude &&
      point.latitude <= northEast.latitude &&
      point.longitude >= southWest.longitude &&
      point.longitude <= northEast.longitude;

  static const values = [
    ServiceArea(
      'Malé',
      GeoPoint(4.1755, 73.5093),
      GeoPoint(4.164, 73.499),
      GeoPoint(4.183, 73.526),
    ),
    ServiceArea(
      'Hulhumalé',
      GeoPoint(4.2160, 73.5410),
      GeoPoint(4.199, 73.528),
      GeoPoint(4.248, 73.559),
    ),
  ];

  static ServiceArea named(String name) => values.firstWhere(
    (area) => area.name == name,
    orElse: () => throw ArgumentError('Unsupported service area'),
  );
}

/// Immutable entrance details retained in memory for this design preview.
class PreviewAddress {
  final String area, building, unit, instructions;
  final GeoPoint point;
  final Map<String, dynamic>? google;
  const PreviewAddress._(
    this.area,
    this.building,
    this.unit,
    this.instructions,
    this.point,
    this.google,
  );

  factory PreviewAddress({
    required String area,
    required String building,
    String unit = '',
    String instructions = '',
    required GeoPoint point,
    Map<String, dynamic>? google,
  }) {
    if (building.trim().isEmpty || !ServiceArea.named(area).contains(point)) {
      throw ArgumentError(
        'A building and an entrance in the area are required',
      );
    }
    return PreviewAddress._(
      area,
      building.trim(),
      unit.trim(),
      instructions.trim(),
      point,
      google == null ? null : Map.unmodifiable(google),
    );
  }

  String get label => [
    building,
    unit,
    area,
    instructions,
  ].where((v) => v.isNotEmpty).join(' · ');

  Map<String, Object> toJson() => {
    'area': area,
    'building': building,
    'unit': unit,
    'instructions': instructions,
    'latitude': point.latitude,
    'longitude': point.longitude,
    'google': ?google,
  };
}
