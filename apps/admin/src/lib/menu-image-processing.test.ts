import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {photoBody,prepareMenuPhoto,maximumPhotoBytes} from './menu-image-processing';
import {MobileError} from './mobile-contract';
test('food photos become square WebP cover/thumbnail with GPS/EXIF stripped',async()=>{
  const input=await sharp({create:{width:1600,height:800,channels:3,background:'#ffe040'}})
    .withExif({IFD0:{Copyright:'Verification'},IFD2:{GPSLatitude:'4/1 10/1 30/1'}}).jpeg().toBuffer();
  const result=await prepareMenuPhoto(input,'image/jpeg'),cover=await sharp(result.cover).metadata(),thumb=await sharp(result.thumbnail).metadata();
  assert.equal(cover.format,'webp');assert.equal(cover.width,800);assert.equal(cover.height,800);
  assert.equal(thumb.width,256);assert.equal(thumb.height,256);assert.equal(cover.exif,undefined);assert.equal(thumb.exif,undefined);assert.equal(cover.icc,undefined);
  assert.ok(result.cover.length<2*1024*1024);
});
test('malformed, disguised vector/animated, small and excessive-pixel files are rejected',async()=>{
  const files=[Buffer.from('not an image'),Buffer.from('<svg width="128" height="128"><rect width="128" height="128"/></svg>'),
    await sharp({create:{width:127,height:128,channels:3,background:'#fff'}}).jpeg().toBuffer(),
    await sharp({create:{width:5000,height:5000,channels:3,background:'#fff'}}).png().toBuffer(),
    await sharp({create:{width:128,height:128,channels:3,background:'#fff'}}).gif().toBuffer()];
  for(const bytes of files)await assert.rejects(()=>prepareMenuPhoto(bytes,'image/jpeg'),MobileError);
});
test('binary upload limits also apply to streamed bodies without content-length',async()=>{
  const request=new Request('https://igo.example/image',{method:'POST',headers:{'content-type':'image/jpeg'},body:new Uint8Array(maximumPhotoBytes+1)});
  await assert.rejects(()=>photoBody(request),e=>e instanceof MobileError&&e.status===413);
  await assert.rejects(()=>photoBody(new Request('https://igo.example/image',{method:'POST',headers:{'content-type':'image/svg+xml'},body:'<svg/>'})),e=>e instanceof MobileError&&e.status===415);
  const small=await photoBody(new Request('https://igo.example/image',{method:'POST',headers:{'content-type':'image/jpeg'},body:new Uint8Array([1,2,3])}));assert.equal(small.bytes.length,3);
});
