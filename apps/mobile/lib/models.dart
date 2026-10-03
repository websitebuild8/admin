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

class PreviewAddress {
  final String area, building, unit, instructions;
  const PreviewAddress(this.area, this.building, this.unit, this.instructions);
  String get label => [
    building,
    unit,
    area,
    instructions,
  ].where((v) => v.isNotEmpty).join(' · ');
}
