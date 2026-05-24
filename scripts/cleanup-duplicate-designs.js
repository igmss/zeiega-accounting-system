/**
 * Cleanup script to remove duplicate designs
 * Groups designs by productId (if exists) or name+category combination
 * Keeps the first one (oldest) and deletes the rest
 */

const admin = require('firebase-admin');

// Use the same service account configuration as the app
const serviceAccount = {
  type: "service_account",
  project_id: "zeiegaapp",
  private_key_id: "fbb9296d1c27652feb0067db06816892dd560c6f",
  private_key: process.env.FIREBASE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDH04crbgRxQk15\nICBrlFLRmKy5ddiIr5yKAmu0qj/HHsA9lWEDlSfVauhCu2hEpjQbmtbHkRp2zDkY\nRek2i1F3d6PNaFMPMsw95745krrdHoyKc9PgVsUos0k9vyjTSgCMm4HuRq2/9iiM\n4PYhHQy8x4dnD46e/fyTcLhcAD+X7BWm3cIbzLF0lzq+gf1ufUF+BWskncl4r3sS\n2PQwcN67Hu6A6/riJI2mb9WL5jjIy/Uog69KkQv4ZEFnYUFG9e+f1ywv7z2eU7AN\nbtcXMpuNN/shB8ty81Hx6RH3RhfLxAaqdhw/dX935WfKCq2ZOqGYEVxux4jf56n5\n00cKmqzdAgMBAAECggEACXhq9ZH3P+7mgREWuEKFUk2sEfYV1xSLlLbcp+lRsHwy乌龙nDiSKntNMf4pF9CN9oLyAUTrXPXxjSPMqOvXS7B6ofDXoIqLNTMxHtX22/+qP4SN\nIJqwtfcmzPECTZzbsHfXYtKT69kJrwlZjqOyxor76Y6DSk0gc0SSTeKPujyAxxBh\n1SR8dfqHt4nCIs6KG4YeM6MMuvZ23/NRaBQLOUsOL99C481wC8jvbmAynnG0bxaX\nst/SDqzAOdU918R+rei9fsOpodntAoH0IEejBHnWfmY3gKpEm+MfpwhrUHLOc+Bi\nfmpVBLSJ0DzbqZkxUtujwXnMJk89NP4yRtAoz4CauQKBgQDvaIz0vOibN7vaSCSz\nyN+OyT7A12r30TzwHX6XIrNVgLFOeHcLLGpkoPRXZeEiSHhqErm1baNww98jWxQT\nK7jVjw/zz/f/SSNtm4q6wN4ljL0GRt1BiEUm1P6RJuSnVfjuHUQGblebpcvzYJqQ\nHmRWEmnOaT/dbGDg0Kt8NlSGqwKBgQDVrLvRSd/TeJK1Tz26Op1kGLts+q3N/k2r\nz9Bys+Da6d2nsWShJOoxpmYlaRV/71hsd+jju7puUefidPLPSe/XA/1rrk1ij/Ux\nnJrQVe4DlPHQ2ArItXVV9YNIiAFDEn1ChTcTwNV7PytuRmvA1ZX0uR9C2D+sa9P9\n/e5LGrW6lwKBgQCJlX0EHRhUM3hqnnExPOx1I2RD8MiReJbbqyeX9aI4Lgg3f3Vy\nX2kZQYKKQ4tZZ2qEExTUlhiKcpZmvC3SQpsrZ9cUF91+wWpx0CSu5K4FyFbNJ6Z5\nxbVv9pIBmudm3zp6pSj1xS3lzidiS48n6b9h050ouUWxm1oleOZEMPjslwKBgGaR\nYxrkrkeRskLMReI2LsUUxita7cFbGCeoOvREemQ7LMZJdfeQg8bPjGra1ZIy7ywq\nJyXiQGyiboAbCU8Nu85nwOdGpSjx1444EWx+QyF/BtDsU8jiqe9YSeuwNYLfxjb/\nQV//Cbr+qLdnoGPRYwk1L9djfLUkkX9zvEZbDO8DAoGAEsYuZR94sx+qNi4qyCiR\ndST6dSpDF3OqckdXxoRZUz+sMbngqjW/TGWxGgb49toNDzCzoj78qNYQbsLqDRnk\nhcZY3+zqnvVcEfD6uRx6JjFOfi8EGpnhtXE9p9cNwGvyKGHO/NzXauFNyJTfxEwQ\ns5LdR6uW2I1DV6V/+DSTyvo=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-erdcc@zeiegaapp.iam.gserviceaccount.com",
  client_id: "115086862820657581958",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-erdcc%40zeiegaapp.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "zeiegaapp"
  });
}

const db = admin.firestore();

async function cleanupDuplicateDesigns() {
  console.log('🔍 Starting duplicate design cleanup...\n');
  
  try {
    // Fetch all designs
    const designsSnapshot = await db.collection('acc_designs').get();
    const designs = designsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Total designs found: ${designs.length}\n`);
    
    // Group by productId first (most reliable), then by name+category
    const groupsByProductId = new Map();
    const groupsByNameCategory = new Map();
    
    designs.forEach(design => {
      const productId = design.productId;
      const name = (design.name || '').trim().toLowerCase();
      const category = (design.category || '').trim().toLowerCase();
      const key = `${name}|||${category}`; // Using ||| as separator
      
      if (productId) {
        if (!groupsByProductId.has(productId)) {
          groupsByProductId.set(productId, []);
        }
        groupsByProductId.get(productId).push(design);
      } else {
        if (!groupsByNameCategory.has(key)) {
          groupsByNameCategory.set(key, []);
        }
        groupsByNameCategory.get(key).push(design);
      }
    });
    
    let totalDuplicates = 0;
    let totalToDelete = 0;
    const toDelete = [];
    
    // Process productId groups
    console.log('🔍 Checking duplicates by productId...');
    for (const [productId, group] of groupsByProductId.entries()) {
      if (group.length > 1) {
        totalDuplicates++;
        // Sort by createdAt (keep oldest)
        group.sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return aTime - bTime;
        });
        
        // Keep first, mark rest for deletion
        const toKeep = group[0];
        const duplicates = group.slice(1);
        
        console.log(`  📦 ProductId "${productId}": ${group.length} duplicates`);
        console.log(`     ✅ Keeping: ${toKeep.id} - ${toKeep.name}`);
        duplicates.forEach(dup => {
          console.log(`     ❌ Deleting: ${dup.id} - ${dup.name}`);
          toDelete.push(dup.id);
          totalToDelete++;
        });
      }
    }
    
    // Process name+category groups (only if not already in productId group)
    console.log('\n🔍 Checking duplicates by name+category...');
    for (const [key, group] of groupsByNameCategory.entries()) {
      // Skip if any in group has productId (already handled)
      if (group.some(d => d.productId)) continue;
      
      if (group.length > 1) {
        totalDuplicates++;
        // Sort by createdAt (keep oldest)
        group.sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return aTime - bTime;
        });
        
        const toKeep = group[0];
        const duplicates = group.slice(1);
        
        const [name, category] = key.split('|||');
        console.log(`  📝 "${name}" in "${category}": ${group.length} duplicates`);
        console.log(`     ✅ Keeping: ${toKeep.id} - ${toKeep.name}`);
        duplicates.forEach(dup => {
          console.log(`     ❌ Deleting: ${dup.id} - ${dup.name}`);
          toDelete.push(dup.id);
          totalToDelete++;
        });
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total designs: ${designs.length}`);
    console.log(`   Duplicate groups: ${totalDuplicates}`);
    console.log(`   Designs to delete: ${totalToDelete}`);
    console.log(`   Designs to keep: ${designs.length - totalToDelete}\n`);
    
    if (toDelete.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }
    
    // Ask for confirmation
    console.log(`⚠️  About to delete ${toDelete.length} duplicate designs...`);
    console.log('   Run with --confirm to actually delete\n');
    
    if (process.argv.includes('--confirm')) {
      console.log('🗑️  Deleting duplicates...\n');
      
      // Delete in batches of 500 (Firestore limit)
      const batchSize = 500;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = db.batch();
        const batchToDelete = toDelete.slice(i, i + batchSize);
        
        batchToDelete.forEach(id => {
          batch.delete(db.collection('acc_designs').doc(id));
        });
        
        await batch.commit();
        console.log(`   ✅ Deleted batch ${Math.floor(i/batchSize) + 1} (${batchToDelete.length} designs)`);
      }
      
      console.log(`\n✅ Successfully deleted ${toDelete.length} duplicate designs!`);
      console.log(`   Remaining designs: ${designs.length - toDelete.length}`);
    } else {
      console.log('💡 To actually delete, run: node scripts/cleanup-duplicate-designs.js --confirm');
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up duplicates:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupDuplicateDesigns().then(() => {
  console.log('\n✅ Cleanup process completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
