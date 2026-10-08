import 'dart:math' as math;
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'browse_widgets.dart';
import 'food_photo.dart';
import 'entrance_map.dart';
import 'main.dart' show CanvasPage, Glass;
import 'models.dart';

class StatusPill extends StatelessWidget {
  final String text;
  final bool dark;
  const StatusPill(this.text, {super.key, this.dark = false});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: dark ? browseInk : browseYellow.withValues(alpha: .35),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: dark ? Colors.white : browseInk,
      ),
    ),
  );
}

class WorkspaceHeading extends StatelessWidget {
  final String eyebrow, title;
  final Widget? trailing;
  const WorkspaceHeading({
    super.key,
    required this.eyebrow,
    required this.title,
    this.trailing,
  });
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              eyebrow.toUpperCase(),
              style: const TextStyle(
                color: browseMuted,
                fontSize: 10,
                letterSpacing: 1.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: const TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                letterSpacing: -1,
              ),
            ),
          ],
        ),
      ),
      ?trailing,
    ],
  );
}

class MenuItemTile extends StatelessWidget {
  final String name, description, amount, category;
  final bool available;
  final Map<String, dynamic>? image;
  final Uint8List? photoBytes;
  final Widget? controls;
  final VoidCallback? onTap;
  const MenuItemTile({
    super.key,
    required this.name,
    required this.description,
    required this.amount,
    this.category = 'General',
    this.available = true,
    this.image,
    this.photoBytes,
    this.controls,
    this.onTap,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Material(
      color: Colors.white.withValues(alpha: .8),
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          category.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 9,
                            letterSpacing: 1,
                            fontWeight: FontWeight.w700,
                            color: browseMuted,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -.3,
                          ),
                        ),
                        if (description.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            description,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: browseMuted,
                            ),
                          ),
                        ],
                        const SizedBox(height: 9),
                        Text(
                          amount,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  FoodPhoto(image: image, bytes: photoBytes, label: name),
                ],
              ),
              if (controls != null) ...[const SizedBox(height: 12), controls!],
              if (!available && controls == null)
                const Padding(
                  padding: EdgeInsets.only(top: 10),
                  child: Text(
                    'Out of stock',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: browseMuted,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

String newMenuDraftId() {
  final random = math.Random.secure(),
      bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// A full-screen editor shared by connected restaurants and the sample kitchen.
/// Ownership, approval and integer-price checks are enforced again by the server.
class MenuEditorPage extends StatefulWidget {
  final Map<String, dynamic>? item;
  final Future<void> Function(Map<String, dynamic>) onSave;
  final Future<void> Function()? onDelete;
  final Future<Map<String, dynamic>> Function(Uint8List)? onUpload;
  final Future<void> Function(String)? onDiscard;
  final Future<Uint8List?> Function()? pickPhoto;
  final bool localPhotos, photoUploadsEnabled;
  const MenuEditorPage({
    super.key,
    this.item,
    required this.onSave,
    this.onDelete,
    this.onUpload,
    this.onDiscard,
    this.pickPhoto,
    this.localPhotos = false,
    this.photoUploadsEnabled = true,
  });
  @override
  State<MenuEditorPage> createState() => _MenuEditorPageState();
}

class _MenuEditorPageState extends State<MenuEditorPage> {
  final form = GlobalKey<FormState>();
  late final name = TextEditingController(text: widget.item?['name'] ?? '');
  late final description = TextEditingController(
    text: widget.item?['description'] ?? '',
  );
  late final category = TextEditingController(
    text: widget.item?['category'] ?? 'General',
  );
  late final amount = TextEditingController(
    text: widget.item == null
        ? ''
        : ((widget.item!['price'] as num) / 100).toStringAsFixed(2),
  );
  late bool available = widget.item?['available'] ?? true;
  bool busy = false;
  String? error;
  late Uint8List? photoBytes = widget.item?['localPhoto'] as Uint8List?;
  bool photoChanged = false;
  String? stagedPhoto;
  final draftId = newMenuDraftId();
  Map<String, dynamic>? get originalPhoto => widget.item?['image'] is Map
      ? Map<String, dynamic>.from(widget.item!['image'])
      : null;
  bool get hasPhoto =>
      photoBytes != null || !photoChanged && originalPhoto != null;
  bool get photosEnabled =>
      widget.localPhotos ||
      widget.photoUploadsEnabled && widget.onUpload != null;

  Future<void> choosePhoto({bool edit = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final bytes = edit
          ? photoBytes ?? await downloadFoodPhoto(originalPhoto!)
          : await (widget.pickPhoto ?? FoodPhotoPicker.choose)();
      if (bytes == null || !mounted) return;
      final prepared = await compute(prepareFoodPhoto, bytes);
      if (!mounted) return;
      final cropped = await Navigator.push<Uint8List>(
        context,
        MaterialPageRoute(builder: (_) => FoodPhotoEditor(photo: prepared)),
      );
      if (cropped == null || !mounted) return;
      discardStaged();
      setState(() {
        photoBytes = cropped;
        photoChanged = true;
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Could not open this photo. Choose a still JPEG, PNG or WebP from your gallery.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void discardStaged() {
    final id = stagedPhoto;
    stagedPhoto = null;
    if (id != null && widget.onDiscard != null) {
      unawaited(widget.onDiscard!(id).catchError((_) {}));
    }
  }

  Widget photoControls() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Center(
        child: FoodPhoto(
          image: photoChanged ? null : originalPhoto,
          bytes: photoBytes,
          label: name.text.isEmpty ? 'Menu item' : name.text,
          size: 180,
          thumbnail: false,
        ),
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 6,
        runSpacing: 4,
        children: [
          TextButton.icon(
            key: const ValueKey('choose-menu-photo'),
            onPressed: busy || !photosEnabled ? null : () => choosePhoto(),
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: Text(
              hasPhoto
                  ? 'Replace photo'
                  : FoodPhotoPicker.hasRecovered
                  ? 'Review recovered photo'
                  : 'Add photo',
            ),
          ),
          if (hasPhoto)
            TextButton.icon(
              key: const ValueKey('edit-menu-photo'),
              onPressed: busy || !photosEnabled
                  ? null
                  : () => choosePhoto(edit: true),
              icon: const Icon(Icons.crop_rotate),
              label: const Text('Edit photo'),
            ),
          if (hasPhoto)
            TextButton.icon(
              key: const ValueKey('remove-menu-photo'),
              onPressed: busy
                  ? null
                  : () {
                      discardStaged();
                      setState(() {
                        photoBytes = null;
                        photoChanged = true;
                      });
                    },
              icon: const Icon(Icons.delete_outline),
              label: const Text('Remove photo'),
            ),
        ],
      ),
      Text(
        photosEnabled
            ? 'Use a food photo you have permission to share. It will be visible to customers. Changes apply when you save.'
            : 'Photo uploads are not available yet.',
        style: const TextStyle(fontSize: 12, color: browseMuted),
      ),
      const SizedBox(height: 22),
    ],
  );
  @override
  void dispose() {
    name.dispose();
    description.dispose();
    category.dispose();
    amount.dispose();
    discardStaged();
    super.dispose();
  }

  Future<void> save() async {
    if (busy) return;
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    // Parse decimal text directly to laari; no floating-point money arithmetic.
    final parts = amount.text.trim().split('.');
    final laari =
        int.parse(parts[0]) * 100 +
        int.parse((parts.length == 2 ? parts[1] : '').padRight(2, '0'));
    try {
      if (photoChanged &&
          photoBytes != null &&
          !widget.localPhotos &&
          stagedPhoto == null) {
        if (widget.onUpload == null) {
          throw Exception('Photo uploads are not available yet.');
        }
        final image = await widget.onUpload!(photoBytes!);
        if (image['id'] is! String) {
          throw Exception('Could not save the food photo.');
        }
        stagedPhoto = image['id'] as String;
      }
      await widget.onSave({
        'id': ?widget.item?['id'],
        if (widget.item == null) 'draftId': draftId,
        if (widget.localPhotos) 'localPhoto': photoBytes,
        if (!widget.localPhotos && photoChanged)
          'imageId': photoBytes == null ? null : stagedPhoto,
        'name': name.text.trim(),
        'description': description.text.trim(),
        'category': category.text.trim(),
        'price': laari,
        'available': available,
      });
      stagedPhoto = null; // The photo now belongs to a committed menu item.
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> remove() async {
    if (busy) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this item?'),
        content: const Text(
          'It will be removed from your menu. Existing order records are kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep item'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete item'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onDelete!();
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: CanvasPage(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 20, 0),
            child: Row(
              children: [
                IconButton(
                  onPressed: busy ? null : () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
                const Spacer(),
                const StatusPill('MENU EDITOR'),
              ],
            ),
          ),
          Expanded(
            child: Form(
              key: form,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    WorkspaceHeading(
                      eyebrow: 'Your kitchen',
                      title: widget.item == null
                          ? 'Add something good.'
                          : 'Edit menu item.',
                    ),
                    const SizedBox(height: 20),
                    photoControls(),
                    TextFormField(
                      enabled: !busy,
                      key: const ValueKey('menu-name'),
                      controller: name,
                      maxLength: 100,
                      decoration: const InputDecoration(
                        labelText: 'Item name',
                        hintText: 'e.g. Iced latte',
                      ),
                      validator: (v) => (v?.trim().length ?? 0) < 2
                          ? 'Enter an item name.'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      enabled: !busy,
                      controller: description,
                      maxLength: 300,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Description & allergens',
                        hintText: 'Ingredients, portion size, and allergens',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      enabled: !busy,
                      key: const ValueKey('menu-category'),
                      controller: category,
                      maxLength: 60,
                      decoration: const InputDecoration(
                        labelText: 'Menu category',
                        hintText: 'Drinks, mains, desserts…',
                      ),
                      validator: (v) => (v?.trim().isEmpty ?? true)
                          ? 'Enter a category.'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      enabled: !busy,
                      key: const ValueKey('menu-price'),
                      controller: amount,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Price (MVR)',
                      ),
                      validator: (v) =>
                          RegExp(r'^\d{1,5}(\.\d{1,2})?$')
                                  .hasMatch(v?.trim() ?? '') &&
                              (double.tryParse(v!.trim()) ?? 0) >= 1 &&
                              (double.tryParse(v.trim()) ?? 0) <= 10000
                          ? null
                          : 'Enter MVR 1–10,000, up to 2 decimals.',
                    ),
                    const SizedBox(height: 18),
                    Glass(
                      padding: const EdgeInsets.all(12),
                      child: SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: available,
                        onChanged: busy
                            ? null
                            : (v) => setState(() => available = v),
                        title: Text(
                          available ? 'Available to order' : 'Out of stock',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: const Text(
                          'Unavailable items cannot be added to a new order.',
                        ),
                      ),
                    ),
                    if (widget.onDelete != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 20),
                        child: TextButton.icon(
                          onPressed: busy ? null : remove,
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('Delete item'),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.red),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                FilledButton(
                  key: const ValueKey('save-menu-item'),
                  onPressed: busy ? null : save,
                  child: Text(busy ? 'Saving…' : 'Save menu item'),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

int deliveryStage(String preparation, String delivery, bool assigned) {
  if (delivery == 'Delivery complete') return 4;
  if (delivery == 'Arrived at customer') return 3;
  if (delivery == 'Order picked up' || preparation == 'Order picked up') {
    return 2;
  }
  if (preparation != 'Awaiting confirmation' && preparation != 'Not started') {
    return 1;
  }
  // Rider assignment is independent from preparation and cannot advance food status.
  return 0;
}

String deliveryHeadline(String preparation, String delivery) {
  if (delivery == 'Delivery complete') return 'Enjoy your order.';
  if (delivery == 'Arrived at customer') return 'Your rider has arrived.';
  if (delivery == 'Order picked up' || preparation == 'Order picked up') {
    return 'Good things are on the way.';
  }
  if (preparation == 'Ready for pickup') return 'Your order is ready.';
  if (preparation == 'Order confirmed') return 'Your kitchen is on it.';
  return 'Your order is with the kitchen.';
}

class OrderProgress extends StatelessWidget {
  final int stage;
  const OrderProgress({super.key, required this.stage});
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          for (int i = 0; i < 5; i++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: i == 4 ? 0 : 5),
                child: Container(
                  height: 5,
                  decoration: BoxDecoration(
                    color: i <= stage ? browseInk : const Color(0xFFE5E5DF),
                    borderRadius: BorderRadius.circular(5),
                  ),
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: 10),
      const Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('Placed', style: TextStyle(fontSize: 10, color: browseMuted)),
          Text(
            'On the way',
            style: TextStyle(fontSize: 10, color: browseMuted),
          ),
          Text('Delivered', style: TextStyle(fontSize: 10, color: browseMuted)),
        ],
      ),
    ],
  );
}

class OrderDetailPage extends StatelessWidget {
  final Map<String, dynamic> order;
  final ValueListenable<List<Map<String, dynamic>>>? feed;
  final VoidCallback onHelp;
  final bool preview;
  const OrderDetailPage({
    super.key,
    required this.order,
    required this.onHelp,
    this.feed,
    this.preview = false,
  });
  @override
  Widget build(BuildContext context) => feed == null
      ? content(context, order)
      : ValueListenableBuilder<List<Map<String, dynamic>>>(
          valueListenable: feed!,
          builder: (context, orders, _) => content(
            context,
            orders.where((o) => o['id'] == order['id']).firstOrNull ?? order,
          ),
        );
  Widget content(BuildContext context, Map<String, dynamic> value) {
    final prep = value['preparation'] as String,
        delivery = value['delivery'] as String;
    final endpoints = value['entrances'] as Map?;
    return CanvasPage(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 14, 0),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: onHelp,
                  icon: const Icon(Icons.help_outline, size: 17),
                  label: const Text('Help'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (preview)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: StatusPill('SAMPLE ORDER'),
                  ),
                Text(
                  value['status'] == 'Needs attention'
                      ? 'Your order needs attention.'
                      : deliveryHeadline(prep, delivery),
                  style: const TextStyle(
                    fontSize: 29,
                    height: 1.1,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -.8,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  value['estimatedDelivery'] ?? 'Delivery estimate pending',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 20),
                OrderProgress(
                  stage: deliveryStage(prep, delivery, value['rider'] != null),
                ),
              ],
            ),
          ),
          JobMap(
            pickup: endpoints?['pickup'] == null
                ? null
                : GeoPoint(
                    (endpoints!['pickup']['lat'] as num).toDouble(),
                    (endpoints['pickup']['lng'] as num).toDouble(),
                  ),
            destination: endpoints?['destination'] == null
                ? null
                : GeoPoint(
                    (endpoints!['destination']['lat'] as num).toDouble(),
                    (endpoints['destination']['lng'] as num).toDouble(),
                  ),
            height: 260,
            radius: 0,
            illustrated: preview,
          ),
          Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Glass(
                  child: Row(
                    children: [
                      const CircleAvatar(
                        backgroundColor: browseYellow,
                        child: Icon(Icons.delivery_dining, color: browseInk),
                      ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              value['rider'] ?? 'Finding your rider',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              delivery,
                              style: const TextStyle(
                                fontSize: 12,
                                color: browseMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Map shows saved entrances. Updates come from your restaurant and rider.',
                  style: TextStyle(fontSize: 11, color: browseMuted),
                ),
                SectionHeading(
                  title: value['restaurant'] ?? 'Your restaurant',
                  subtitle: value['publicId'] ?? value['id'],
                ),
                Text(value['items'] ?? ''),
                const SizedBox(height: 12),
                Text(
                  money(value['amount'] as int),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SectionHeading(title: 'Order updates'),
                for (final e
                    in ((value['events'] as List?) ?? []).reversed.take(10))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.check_circle_outline, size: 20),
                    title: Text(
                      e['text'],
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      DateTime.parse(e['at']).toLocal().toString(),
                      style: const TextStyle(fontSize: 11),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Uses the same full-screen map and bottom work panel for preview and connected
/// riders. The map is an area overview or assigned endpoints, never a GPS fix.
class RiderMapWorkspace extends StatelessWidget {
  final String area;
  final bool online, illustrated;
  final Widget panel;
  final GeoPoint? pickup, destination;
  final VoidCallback? onAvailability;
  const RiderMapWorkspace({
    super.key,
    required this.area,
    required this.online,
    required this.panel,
    this.pickup,
    this.destination,
    this.onAvailability,
    this.illustrated = false,
  });
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final panelHeight = math.min(
        constraints.maxHeight * .44,
        math.max(0.0, constraints.maxHeight - 378),
      );
      return Stack(
        children: [
          Positioned.fill(
            child: JobMap(
              pickup: pickup,
              destination: destination,
              area: area,
              height: double.infinity,
              radius: 0,
              illustrated: illustrated,
              // Reserve the full bounded panel and navigation space so Google's
              // attribution and the fit control stay above our overlays.
              bottomInset: panelHeight + 118,
              topInset: 100,
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            top: 12,
            child: Row(
              children: [
                const StatusPill('iGO DELIVERY', dark: true),
                const Spacer(),
                StatusPill(area),
              ],
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            top: 60,
            child: Align(
              alignment: Alignment.centerLeft,
              child: StatusPill(
                pickup == null
                    ? 'Service area overview'
                    : 'Saved job entrances',
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 106,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: panelHeight),
              child: Glass(
                padding: const EdgeInsets.all(18),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              online ? 'You’re online' : 'You’re offline',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 20,
                              ),
                            ),
                          ),
                          if (onAvailability != null)
                            Switch(
                              value: online,
                              onChanged: (_) => onAvailability!(),
                            ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      panel,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    },
  );
}
