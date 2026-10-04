import { z } from 'zod';
import { island, MobileError } from './mobile-contract';

export const mapBounds = {
  'Malé': [4.164, 73.499, 4.183, 73.526],
  'Hulhumalé': [4.199, 73.528, 4.248, 73.559],
} as const;
export const placesInput = z.discriminatedUnion('action', [
  z.object({action:z.literal('search'),area:island,input:z.string().trim().min(3).max(150),sessionToken:z.uuid()}).strict(),
  z.object({action:z.literal('resolve'),area:island,placeId:z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),sessionToken:z.uuid()}).strict(),
]);

type PlacesResult = {suggestions:{placeId:string;label:string}[]} | {placeId:string;latitude:number;longitude:number};
/** No disk cache or full provider response is returned to the client. */
export async function placesProvider(input:z.infer<typeof placesInput>, key:string, fetcher:typeof fetch=fetch):Promise<PlacesResult> {
  const [south,west,north,east] = mapBounds[input.area];
  const search = input.action === 'search';
  const url = search ? 'https://places.googleapis.com/v1/places:autocomplete'
    : `https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}?sessionToken=${input.sessionToken}`;
  let response:Response;
  try {
    response = await fetcher(url, {
      method: search ? 'POST' : 'GET', cache:'no-store', signal:AbortSignal.timeout(8000),
      headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':search ? 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' : 'id,location',...(search ? {'Content-Type':'application/json'} : {})},
      ...(search ? {body:JSON.stringify({input:input.input,sessionToken:input.sessionToken,includedRegionCodes:['mv'],
        locationRestriction:{rectangle:{low:{latitude:south,longitude:west},high:{latitude:north,longitude:east}}}})} : {}),
    });
  } catch { throw new MobileError('Location search is unavailable. Please try again.',503); }
  if (!response.ok) throw new MobileError('Location search is unavailable. Please try again.',503);
  let value:unknown;
  try { value=await response.json(); } catch { throw new MobileError('Location search is unavailable.',503); }
  if (search) {
    const v=z.object({suggestions:z.array(z.object({placePrediction:z.object({placeId:z.string(),text:z.object({text:z.string()})}).optional()})).default([])}).safeParse(value);
    if(!v.success) throw new MobileError('Location search is unavailable.',503);
    return {suggestions:v.data.suggestions.flatMap(s=>s.placePrediction ? [{placeId:s.placePrediction.placeId,label:s.placePrediction.text.text}] : []).slice(0,5)};
  }
  const v=z.object({id:z.string(),location:z.object({latitude:z.number().finite(),longitude:z.number().finite()})}).safeParse(value);
  if (!v.success) throw new MobileError('This place has no usable location. Try another result.',422);
  const {latitude,longitude}=v.data.location;
  if(latitude<south || latitude>north || longitude<west || longitude>east) throw new MobileError(`Choose a building in ${input.area}.`,422);
  return {placeId:v.data.id,latitude,longitude};
}
