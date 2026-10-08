import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { database } from '../src/lib/db';
import { createSandbox, demoIds, type DemoRole } from '../src/lib/demo-sandbox';
import { hashDemoKey } from '../src/lib/demo-repository';
import { flushPhotoDeletes } from '../src/lib/menu-image-service';
import { menuImageViewSchema } from '../src/lib/menu-image-contract';
import { menuImageBucket, storageSettings } from '../src/lib/menu-image-storage';
import { GET, POST } from '../src/app/api/demo/mobile/[resource]/route';

// Uses real Storage, but only a new short-lived fictional session. Never logs
// URLs, keys, headers, provider bodies or database error messages.
async function main() {
  storageSettings();
  const db = database(), key = `igo_demo_${randomBytes(32).toString('hex')}`;
  const marker = `storage-verification-${randomUUID()}`;
  let sessionId: string | undefined, stage = 'database preflight';
  try {
    const bucket = await db.$queryRaw<Array<{ public: boolean }>>`
      SELECT public FROM storage.buckets WHERE id = ${menuImageBucket}`;
    assert.equal(bucket[0]?.public, true, 'The food photo bucket must exist and allow public downloads.');
    const session = await db.demoSession.create({ data: {
      ownerClerkId: marker, keyHash: hashDemoKey(key), payload: createSandbox(),
      expiresAt: new Date(Date.now() + 30 * 60000),
    } });
    sessionId = session.id;
    const context = (resource: string) => ({ params: Promise.resolve({ resource }) });
    const headers = (role: DemoRole) => ({ authorization: `Bearer ${key}`, 'x-igo-demo-role': role });
    async function write(resource: string, input: object | Uint8Array, type = 'application/json', role: DemoRole = 'restaurant') {
      const request = new NextRequest(`https://igo.example/api/demo/mobile/${resource}`, {
        method: 'POST', headers: { ...headers(role), 'content-type': type },
        body: input instanceof Uint8Array ? new Uint8Array(input) : JSON.stringify(input),
      });
      const response = await POST(request, context(resource));
      assert.equal(response.status, 200, `${resource} returned HTTP ${response.status}.`);
      return response.json();
    }
    async function customerItem(id: string) {
      const response = await GET(new NextRequest(`https://igo.example/api/demo/mobile/catalog?restaurantId=${demoIds.restaurant}`, {
        headers: headers('customer'),
      }), context('catalog'));
      assert.equal(response.status, 200, 'The customer catalog must be readable.');
      const result = await response.json();
      assert.equal(result.restaurant.acceptingOrders, true);
      return (result.items as Array<{ id: string; image: unknown }>).find(item => item.id === id);
    }
    async function storedObjects(id: string) {
      return db.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM storage.objects WHERE bucket_id = ${menuImageBucket}
        AND name LIKE ${`demo/${session.id}/${id}/%`}`;
    }
    async function checkDownload(image: unknown, expectedSize: number) {
      const photo = menuImageViewSchema.parse(image);
      for (const [url, size] of [[photo.url, expectedSize], [photo.thumbnailUrl, 256]] as const) {
        // Intentionally no auth headers: these food-only derivatives are public.
        const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
        assert.equal(response.status, 200, 'Public food photo download must succeed.');
        assert.match(response.headers.get('content-type') ?? '', /^image\/webp/);
        const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
        assert.equal(metadata.format, 'webp');
        assert.equal(metadata.width, size); assert.equal(metadata.height, size);
        assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined);
      }
      assert.equal((await storedObjects(photo.id)).length, 2, 'Both Storage objects must belong to the connected database project.');
      return photo;
    }
    async function checkDeleted(id: string) {
      assert.equal((await storedObjects(id)).length, 0, 'Removed objects must no longer exist in Storage metadata.');
      assert.equal((await db.menuImage.findUniqueOrThrow({ where: { id } })).state, 'Deleted');
    }
    const fields = { name: 'Temporary photo verification', description: 'Fictional fixture', category: 'Food', price: 2500, available: true };
    const itemId = randomUUID();
    stage = 'real upload and public customer download';
    const jpeg = await sharp({ create: { width: 1536, height: 1152, channels: 3, background: '#ffe040' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const first = await write('menu-image', new Uint8Array(jpeg), 'image/jpeg');
    const photo = await checkDownload(first.image, 1024);
    await write('menu', { ...fields, draftId: itemId, imageId: photo.id });
    assert.equal(menuImageViewSchema.parse((await customerItem(itemId))?.image).id, photo.id);

    stage = 'replacement and removal';
    const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#fff8de' } }).png().toBuffer();
    const second = await write('menu-image', new Uint8Array(png), 'image/png');
    const replacement = await checkDownload(second.image, 480);
    await write('menu', { ...fields, id: itemId, imageId: replacement.id });
    assert.equal(menuImageViewSchema.parse((await customerItem(itemId))?.image).id, replacement.id);
    await checkDeleted(photo.id);
    await write('menu', { ...fields, id: itemId, imageId: null });
    assert.equal((await customerItem(itemId))?.image, null);
    await checkDeleted(replacement.id);

    stage = 'menu deletion';
    const third = await write('menu-image', new Uint8Array(png), 'image/png');
    const last = menuImageViewSchema.parse(third.image);
    await write('menu', { ...fields, id: itemId, imageId: last.id });
    await write('menu-delete', { id: itemId });
    assert.equal(await customerItem(itemId), undefined);
    await checkDeleted(last.id);
  } catch (error) {
    console.error(`Real Storage verification failed during ${stage}.`, { name: error instanceof Error ? error.name : 'Unknown' });
    throw new Error('Storage verification did not complete; private diagnostics are intentionally omitted.');
  } finally {
    try {
      if (sessionId) {
        const owner = { kind: 'demo' as const, id: sessionId };
        // End only this fixture, then retain a durable queue until its files are
        // confirmed removed. Never run the global collector during verification.
        await db.$transaction(async tx => {
          await tx.demoSession.deleteMany({ where: { id: sessionId, ownerClerkId: marker } });
          await tx.menuImage.updateMany({ where: { ownerKind: owner.kind, ownerId: owner.id }, data: { state: 'Deleting', attachedTo: null } });
        });
        await flushPhotoDeletes(owner);
        const remaining = await db.$queryRaw<Array<{ name: string }>>`
          SELECT name FROM storage.objects WHERE bucket_id = ${menuImageBucket}
          AND name LIKE ${`demo/${sessionId}/%`}`;
        assert.equal(remaining.length, 0, 'Test Storage objects must all be removed.');
        await db.menuImage.deleteMany({ where: { ownerKind: owner.kind, ownerId: owner.id, state: 'Deleted' } });
        console.log('Cleanup complete: temporary demo session, photo records and Storage objects removed.');
      }
    } catch {
      console.error('Temporary fixture cleanup could not finish. Any remaining photo records retain their deletion queue; retry cleanup with working Storage access.');
      throw new Error('Temporary fixture cleanup requires attention.');
    } finally { await db.$disconnect(); }
  }
  console.log('PASS: real Supabase upload, public WebP cover/thumbnail download, metadata stripping, shared customer visibility, replace/remove and menu deletion. No real accounts, orders or menu items changed.');
}
main().catch(() => { process.exitCode = 1; });
