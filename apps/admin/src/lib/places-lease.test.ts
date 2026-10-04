import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleProof,validateGoogleLease} from './places-lease';
const secret='a-test-secret-with-more-than-32-characters',now=Date.parse('2026-10-05T00:00:00Z');
function address() {
  const value={area:'Malé' as const,latitude:4.1755,longitude:73.5093,google:{placeId:'example',expiresAt:'2026-10-31T00:00:00Z',proof:''}};
  value.google.proof=googleProof('user_1',value,secret);return value;
}
test('Google address lease binds user, island, coordinates and expiry',()=>{
  const value=address();validateGoogleLease('user_1',value,secret,now);
  for(const changed of [{...value,latitude:4.176},{...value,area:'Hulhumalé' as const},
    {...value,google:{...value.google,expiresAt:'2027-01-01T00:00:00Z'}}]) assert.throws(()=>validateGoogleLease('user_1',changed,secret,now));
  assert.throws(()=>validateGoogleLease('other_user',value,secret,now));
});
test('Expired and malformed leases are rejected; user-entered pins need no provider lease',()=>{
  const value=address();
  assert.throws(()=>validateGoogleLease('user_1',value,secret,Date.parse(value.google.expiresAt)));
  assert.throws(()=>validateGoogleLease('user_1',{...value,google:{...value.google,proof:'aa'}},secret,now));
  validateGoogleLease('user_1',{area:'Malé',latitude:4.1755,longitude:73.5093},'',now);
});
