import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placesInput, placesProvider } from './places-provider';
import { MobileError } from './mobile-contract';
const sessionToken='c1104c22-fd75-4501-803c-7c1f13bacee3';
const search={action:'search' as const,area:'Malé' as const,input:'Majeedhee',sessionToken};
test('Places search validates island, session and input; no arbitrary URLs',()=>{
  assert.ok(placesInput.safeParse(search).success);
  for(const bad of [{...search,area:'Addu'},{...search,input:'a'},{...search,sessionToken:'bad'},
    {action:'resolve',area:'Malé',placeId:'https://evil.example/',sessionToken}]) assert.equal(placesInput.safeParse(bad).success,false);
});
test('Places restricts search to selected island/Maldives and strips provider data',async()=>{
  const mock:typeof fetch=async(url,options)=>{
    assert.equal(url,'https://places.googleapis.com/v1/places:autocomplete');
    assert.equal(options?.cache,'no-store');
    const body=JSON.parse(options?.body as string);
    assert.equal(body.sessionToken,sessionToken);assert.deepEqual(body.includedRegionCodes,['mv']);
    assert.deepEqual(body.locationRestriction.rectangle.low,{latitude:4.164,longitude:73.499});
    assert.equal(new Headers(options?.headers).get('X-Goog-Api-Key'),'private-key');
    return Response.json({suggestions:[{placePrediction:{placeId:'place_1',text:{text:'A building'},extra:'discard'}},{queryPrediction:{text:'discard'}}],secret:'discard'});
  };
  assert.deepEqual(await placesProvider(search,'private-key',mock),{suggestions:[{placeId:'place_1',label:'A building'}]});
});
test('Places resolution uses same session, minimum fields and rejects wrong island',async()=>{
  const input={action:'resolve' as const,area:'Malé' as const,placeId:'place_1',sessionToken};
  const mock:typeof fetch=async(url,options)=>{
    assert.ok(String(url).endsWith(`?sessionToken=${sessionToken}`));
    assert.equal(new Headers(options?.headers).get('X-Goog-FieldMask'),'id,location');
    return Response.json({id:'place_1',location:{latitude:4.1755,longitude:73.5093},formattedAddress:'discard'});
  };
  assert.deepEqual(await placesProvider(input,'key',mock),{placeId:'place_1',latitude:4.1755,longitude:73.5093});
  await assert.rejects(()=>placesProvider(input,'key',async()=>Response.json({id:'place_1',location:{latitude:4.216,longitude:73.541}})),e=>e instanceof MobileError&&e.status===422);
});
test('Google errors cannot expose credentials or provider internals',async()=>{
  for(const mock of [async()=>Response.json({error:'private-key'},{status:403}),async()=>{throw new Error('private-key');}])
    await assert.rejects(()=>placesProvider(search,'private-key',mock),e=>e instanceof MobileError&&e.status===503&&!e.message.includes('private-key'));
});
