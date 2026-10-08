import {config} from 'dotenv';
config({path:'.env.local',quiet:true});
import {cleanMenuImages} from '../src/lib/menu-image-service';
import {storageSettings} from '../src/lib/menu-image-storage';
import {database} from '../src/lib/db';
async function main(){storageSettings();const result=await cleanMenuImages();console.log('Food photo cleanup complete.',result);}
main().catch(()=>{console.error('Food photo cleanup failed. Check backend configuration and retry.');process.exitCode=1;}).finally(()=>database().$disconnect());
