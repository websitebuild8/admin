import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as imaging;
import 'package:image_picker/image_picker.dart';

import 'browse_widgets.dart';
import 'main.dart' show CanvasPage, Glass;

const maxFoodPhotoBytes = 3 * 1024 * 1024;
const maxOriginalPhotoBytes = 20 * 1024 * 1024;

class FoodPhoto extends StatelessWidget {
  final Map<String, dynamic>? image;
  final Uint8List? bytes;
  final String label;
  final double size;
  final bool thumbnail;
  const FoodPhoto({
    super.key,
    this.image,
    this.bytes,
    required this.label,
    this.size = 64,
    this.thumbnail = true,
  });
  @override
  Widget build(BuildContext context) {
    final placeholder = ColoredBox(
      color: const Color(0xFFF5F3E9),
      child: Center(
        child: Icon(
          Icons.restaurant_outlined,
          size: math.min(size / 2, 40),
          color: browseMuted,
        ),
      ),
    );
    final url = image?[thumbnail ? 'thumbnailUrl' : 'url'];
    final cacheSize = (size * MediaQuery.devicePixelRatioOf(context))
        .round()
        .clamp(64, thumbnail ? 256 : 1024);
    Widget photo = placeholder;
    if (bytes != null) {
      photo = Image.memory(
        bytes!,
        fit: BoxFit.cover,
        cacheWidth: cacheSize,
        errorBuilder: (_, _, _) => placeholder,
      );
    } else if (url is String && Uri.tryParse(url)?.scheme == 'https') {
      photo = Image.network(
        url,
        fit: BoxFit.cover,
        cacheWidth: cacheSize,
        errorBuilder: (_, _, _) => placeholder,
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : placeholder,
      );
    }
    return Semantics(
      label: '$label photo',
      image: true,
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          height: size,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: photo,
          ),
        ),
      ),
    );
  }
}

// Photo Picker can recreate Android's activity. Recover the result on startup,
// but leave review and attachment to an explicit menu edit by the restaurant.
class FoodPhotoPicker {
  static XFile? recovered;
  static final picker = ImagePicker();
  static Future<void> recover() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      final result = await picker.retrieveLostData();
      if (!result.isEmpty && result.files?.isNotEmpty == true) {
        recovered = result.files!.first;
      }
    } catch (_) {
      /* A unavailable gallery must not prevent sign-in. */
    }
  }

  static bool get hasRecovered => recovered != null;
  static Future<Uint8List?> choose() async {
    final file =
        recovered ??
        await picker.pickImage(
          source: ImageSource.gallery,
          maxWidth: 2048,
          maxHeight: 2048,
          imageQuality: 90,
          requestFullMetadata: false,
        );
    recovered = null;
    if (file == null) return null;
    if (await file.length() > maxOriginalPhotoBytes) {
      throw Exception('Choose a smaller food photo (under 20 MB).');
    }
    return file.readAsBytes();
  }
}

class PreparedFoodPhoto {
  final Uint8List bytes;
  final int width, height;
  const PreparedFoodPhoto(this.bytes, this.width, this.height);
}

PreparedFoodPhoto prepareFoodPhoto(Uint8List bytes) {
  try {
    return _prepareFoodPhoto(bytes);
  } catch (_) {
    throw const FormatException(
      'Choose a clear still JPEG, PNG or WebP food photo.',
    );
  }
}

PreparedFoodPhoto _prepareFoodPhoto(Uint8List bytes) {
  if (bytes.isEmpty || bytes.length > maxOriginalPhotoBytes) {
    throw Exception('Choose a smaller food photo.');
  }
  final jpeg = bytes.length >= 12 && bytes[0] == 255 && bytes[1] == 216;
  final png =
      bytes.length >= 12 &&
      listEquals(bytes.sublist(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
  final webp =
      bytes.length >= 12 &&
      listEquals(bytes.sublist(0, 4), [82, 73, 70, 70]) &&
      listEquals(bytes.sublist(8, 12), [87, 69, 66, 80]);
  if (!jpeg && !png && !webp) {
    throw const FormatException('Unsupported photo format.');
  }
  final decoder = imaging.findDecoderForData(bytes);
  final info = decoder?.startDecode(bytes);
  if (info == null ||
      info.width < 128 ||
      info.height < 128 ||
      info.width * info.height > 16 * 1024 * 1024 ||
      info.numFrames > 1) {
    throw Exception('Choose a still photo at least 128 pixels wide and high.');
  }
  final decoded = decoder!.decodeFrame(0);
  if (decoded == null) {
    throw Exception('This photo cannot be opened. Try JPEG, PNG or WebP.');
  }
  var image = imaging.bakeOrientation(decoded);
  if (math.max(image.width, image.height) > 2048) {
    image = imaging.copyResize(
      image,
      width: image.width >= image.height ? 2048 : null,
      height: image.height > image.width ? 2048 : null,
    );
  }
  if (image.width < 128 || image.height < 128) {
    throw const FormatException('Choose a less narrow food photo.');
  }
  // New JPEG pixels have no original EXIF, GPS or identifying metadata.
  final clean = imaging.Image(
    width: image.width,
    height: image.height,
    numChannels: 3,
  );
  imaging.fill(clean, color: imaging.ColorRgb8(255, 255, 255));
  imaging.compositeImage(clean, image);
  return PreparedFoodPhoto(
    Uint8List.fromList(imaging.encodeJpg(clean, quality: 92)),
    clean.width,
    clean.height,
  );
}

class FoodCrop {
  final PreparedFoodPhoto photo;
  final int turns;
  final double left, top, extent;
  const FoodCrop({
    required this.photo,
    required this.turns,
    required this.left,
    required this.top,
    required this.extent,
  });
}

Uint8List cropFoodPhoto(FoodCrop crop) {
  var image = imaging.decodeJpg(crop.photo.bytes)!;
  if (crop.turns % 4 != 0) {
    image = imaging.copyRotate(image, angle: (crop.turns % 4) * 90);
  }
  final side = (math.min(image.width, image.height) * crop.extent)
      .round()
      .clamp(128, math.min(image.width, image.height))
      .toInt();
  final x = (crop.left * image.width)
      .round()
      .clamp(0, image.width - side)
      .toInt();
  final y = (crop.top * image.height)
      .round()
      .clamp(0, image.height - side)
      .toInt();
  var result = imaging.copyCrop(image, x: x, y: y, width: side, height: side);
  if (side > 1024) {
    result = imaging.copyResize(
      result,
      width: 1024,
      height: 1024,
      interpolation: imaging.Interpolation.average,
    );
  }
  // Rebuild pixels to remove metadata even if a decoder changes its defaults.
  final clean = imaging.Image(
    width: result.width,
    height: result.height,
    numChannels: 3,
  );
  imaging.compositeImage(clean, result);
  return Uint8List.fromList(imaging.encodeJpg(clean, quality: 85));
}

Future<Uint8List> downloadFoodPhoto(Map<String, dynamic> image) async {
  final uri = Uri.tryParse(image['url'] as String? ?? '');
  if (uri == null ||
      uri.scheme != 'https' ||
      !RegExp(r'^[a-z0-9-]+\.supabase\.co$').hasMatch(uri.host) ||
      uri.userInfo.isNotEmpty ||
      !uri.path.startsWith('/storage/v1/object/public/igo-menu-images/')) {
    throw Exception(
      'Choose the original food photo from your gallery to edit it.',
    );
  }
  final client = http.Client();
  try {
    final response = await client
        .send(http.Request('GET', uri)..followRedirects = false)
        .timeout(const Duration(seconds: 12));
    if (response.statusCode != 200 ||
        (response.contentLength ?? 0) > maxFoodPhotoBytes) {
      throw Exception(
        'Could not open this photo. Choose it from your gallery instead.',
      );
    }
    final buffer = BytesBuilder(copy: false);
    await for (final chunk in response.stream.timeout(
      const Duration(seconds: 12),
    )) {
      if (buffer.length + chunk.length > maxFoodPhotoBytes) {
        throw Exception('Choose a smaller food photo.');
      }
      buffer.add(chunk);
    }
    return buffer.takeBytes();
  } finally {
    client.close();
  }
}

class FoodPhotoEditor extends StatefulWidget {
  final PreparedFoodPhoto photo;
  const FoodPhotoEditor({super.key, required this.photo});
  @override
  State<FoodPhotoEditor> createState() => _FoodPhotoEditorState();
}

class _FoodPhotoEditorState extends State<FoodPhotoEditor> {
  final transform = TransformationController();
  int turns = 0;
  double viewport = 0;
  bool busy = false;
  String? error;
  double get width =>
      (turns.isEven ? widget.photo.width : widget.photo.height).toDouble();
  double get height =>
      (turns.isEven ? widget.photo.height : widget.photo.width).toDouble();
  double get fit => viewport / math.min(width, height);
  void reset() {
    transform.value = Matrix4.identity()
      ..setTranslationRaw(
        (viewport - width * fit) / 2,
        (viewport - height * fit) / 2,
        0,
      );
  }

  @override
  void dispose() {
    transform.dispose();
    super.dispose();
  }

  Future<void> done() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final scale = transform.value.getMaxScaleOnAxis();
      final origin = transform.value.getTranslation();
      final crop = FoodCrop(
        photo: widget.photo,
        turns: turns,
        left: -origin.x / (scale * fit * width),
        top: -origin.y / (scale * fit * height),
        extent: 1 / scale,
      );
      final bytes = await compute(cropFoodPhoto, crop);
      if (bytes.length > maxFoodPhotoBytes) {
        throw Exception('This photo is too large. Choose a smaller photo.');
      }
      if (mounted) Navigator.pop(context, bytes);
    } catch (_) {
      if (mounted) {
        setState(() {
          busy = false;
          error = 'Could not edit this photo. Please try another.';
        });
      }
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
                const Expanded(
                  child: Text(
                    'Edit food photo',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  'Move and pinch to frame your dish.',
                  style: TextStyle(color: browseMuted),
                ),
                const SizedBox(height: 20),
                ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final size = constraints.maxWidth;
                        if (viewport != size) {
                          viewport = size;
                          reset();
                        }
                        return Stack(
                          fit: StackFit.expand,
                          children: [
                            InteractiveViewer(
                              transformationController: transform,
                              constrained: false,
                              alignment: Alignment.topLeft,
                              minScale: 1,
                              maxScale: math.min(
                                4.0,
                                math.min(width, height) / 128,
                              ),
                              panEnabled: !busy,
                              scaleEnabled: !busy,
                              child: SizedBox(
                                width: width * fit,
                                height: height * fit,
                                child: RotatedBox(
                                  quarterTurns: turns,
                                  child: Image.memory(
                                    widget.photo.bytes,
                                    fit: BoxFit.fill,
                                  ),
                                ),
                              ),
                            ),
                            const IgnorePointer(
                              child: CustomPaint(painter: _CropGrid()),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Glass(
                  padding: const EdgeInsets.all(8),
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 12,
                    children: [
                      TextButton.icon(
                        key: const ValueKey('rotate-food-photo'),
                        onPressed: busy
                            ? null
                            : () => setState(() {
                                turns = (turns + 1) % 4;
                                reset();
                              }),
                        icon: const Icon(Icons.rotate_right),
                        label: const Text('Rotate'),
                      ),
                      TextButton.icon(
                        onPressed: busy ? null : () => setState(reset),
                        icon: const Icon(Icons.refresh),
                        label: const Text('Reset crop'),
                      ),
                    ],
                  ),
                ),
                if (error != null)
                  Text(error!, style: const TextStyle(color: Colors.red)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: FilledButton(
              key: const ValueKey('use-food-photo'),
              onPressed: busy ? null : done,
              child: Text(busy ? 'Preparing…' : 'Use photo'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _CropGrid extends CustomPainter {
  const _CropGrid();
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: .45)
      ..strokeWidth = 1;
    for (final fraction in [1 / 3, 2 / 3]) {
      canvas.drawLine(
        Offset(size.width * fraction, 0),
        Offset(size.width * fraction, size.height),
        paint,
      );
      canvas.drawLine(
        Offset(0, size.height * fraction),
        Offset(size.width, size.height * fraction),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CropGrid oldDelegate) => false;
}
