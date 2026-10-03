import {config} from 'dotenv';
import {createClerkClient} from '@clerk/backend';
config({path:'.env.local',quiet:true});
// This pilot uses the existing development instance. Never switch production
// identity restrictions using a copied development script.
if(!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') || !process.env.ADMIN_CLERK_USER_IDS) throw new Error('Development Clerk key and explicit admin IDs required.');
try {
 const client=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
 const restrictions=await client.instance.updateRestrictions({allowlist:false});
 const orgs=await client.instance.updateOrganizationSettings({enabled:false});
 console.log(JSON.stringify({publicMobileRegistration:!restrictions.allowlist,organizationsEnabled:orgs.enabled,adminIdRestrictionRetained:!!process.env.ADMIN_CLERK_USER_IDS}));
} catch(error) { console.error('Clerk setup failed:',error.status??'network error');process.exitCode=1; }
