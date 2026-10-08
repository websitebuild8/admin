import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireAttachableImage} from './menu-image-contract';
import {MobileError,menuInput} from './mobile-contract';
const owner={kind:'restaurant' as const,id:crypto.randomUUID()},itemId=crypto.randomUUID();
const now=new Date(),ready={id:crypto.randomUUID(),ownerKind:owner.kind,ownerId:owner.id,state:'Ready',attachedTo:null,createdAt:now};
test('food photo claims bind the owner and item; foreign/expired/unfinished claims fail',()=>{
  assert.doesNotThrow(()=>requireAttachableImage(ready,owner,itemId,now));
  for(const patch of [{ownerId:crypto.randomUUID()},{ownerKind:'demo'}])assert.throws(()=>requireAttachableImage({...ready,...patch},owner,itemId,now),e=>e instanceof MobileError&&e.status===404);
  for(const patch of [{state:'Uploading'},{state:'Deleting'},{state:'Deleted'},{state:'Attached',attachedTo:crypto.randomUUID()},{createdAt:new Date(now.getTime()-25*3600000)}])
    assert.throws(()=>requireAttachableImage({...ready,...patch},owner,itemId,now),e=>e instanceof MobileError&&e.status===409);
  assert.doesNotThrow(()=>requireAttachableImage({...ready,state:'Attached',attachedTo:itemId},owner,itemId,now));
});
test('menu requests accept asset IDs or explicit removal, never client URLs or ownership',()=>{
  const fields={name:'Test cake',category:'Desserts',description:'',price:1000,available:true};
  assert.ok(menuInput.safeParse({...fields,imageId:ready.id,draftId:itemId}).success);
  assert.ok(menuInput.safeParse({...fields,imageId:null}).success);
  for(const extra of [{imageId:'https://bad.example/image.jpg'},{image:{url:'https://bad.example'}},{imageUrl:'https://bad.example'},{ownerId:owner.id}])assert.equal(menuInput.safeParse({...fields,...extra}).success,false);
});
