import fs from 'fs';
import unzipper from 'unzipper';
import { PassThrough } from 'stream';
import AdmZip from 'adm-zip';

async function test() {
  fs.writeFileSync('test.txt', 'hello world');
  fs.writeFileSync('test2.txt', 'hello again');
  const zip = new AdmZip();
  zip.addLocalFile('test.txt');
  zip.addLocalFile('test2.txt');
  zip.writeZip('test.zip');
  
  const zipStream = fs.createReadStream('test.zip');
  const unzip = zipStream.pipe(unzipper.Parse({forceStream: true}));
  
  for await (const entry of unzip) {
    console.log("Entry:", entry.path);
    entry.autodrain();
  }
}
test().catch(console.error);
