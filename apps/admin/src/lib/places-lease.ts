import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { addressInput, MobileError } from './mobile-contract';
type Address=Pick<z.infer<typeof addressInput>,'area'|'latitude'|'longitude'|'google'>;
export function googleProof(user:string,address:Address,secret:string) {
  if(secret.length<32) throw new MobileError('Location search is not configured.',503);
  return createHmac('sha256',secret).update(JSON.stringify([user,address.area,address.latitude,address.longitude,address.google?.placeId,address.google?.expiresAt])).digest('hex');
}
export function validateGoogleLease(user:string,address:Address,secret:string,now=Date.now()) {
  if(!address.google) return;
  const expected=Buffer.from(googleProof(user,address,secret),'hex'), received=Buffer.from(address.google.proof,'hex');
  if(received.length!==expected.length || !timingSafeEqual(received,expected) || Date.parse(address.google.expiresAt)<=now)
    throw new MobileError('Search for this building again before saving.',409);
}
