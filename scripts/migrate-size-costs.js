const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'teluaseghapp',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();

// Default multipliers per size range (same as SizeCostService)
const KIDS_SIZES = ['2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','11Y','12Y','13Y','14Y','15Y','16Y'];
const ADULT_SIZES = ['XS','S','M','L','XL'];

function getMultipliers(sizeValue) {
  if (sizeValue <= 6) return { mat: 0.8, lab: 0.9, time: 0.9, ovh: 1.0 };
  if (sizeValue <= 10) return { mat: 1.0, lab: 1.0, time: 1.0, ovh: 1.0 };
  if (sizeValue <= 13) return { mat: 1.2, lab: 1.1, time: 1.1, ovh: 1.0 };
  return { mat: 1.4, lab: 1.2, time: 1.2, ovh: 1.1 };
}

function generateSizeCosts(design) {
  const sizeCosts = {};
  const isKids = (design.category || '').toLowerCase().includes('kids') ||
                 (design.category || '').toLowerCase().includes('child');

  if (isKids) {
    for (const size of KIDS_SIZES) {
      const val = parseInt(size);
      const m = getMultipliers(val);
      const mat = (design.materialCost || 0) * m.mat;
      const labHr = (design.laborCost || 0) * m.lab;
      const time = (design.manufacturingTime || 0) * m.time;
      const ovh = (design.overheadCost || 0) * m.ovh;
      sizeCosts[size] = { materialCost: mat, laborCostPerHour: labHr, manufacturingTime: time, overheadCost: ovh, totalCost: mat + (labHr * time) + ovh };
    }
  } else {
    const mat = design.materialCost || 0;
    const labHr = design.laborCost || 0;
    const time = design.manufacturingTime || 0;
    const ovh = design.overheadCost || 0;
    const total = mat + (labHr * time) + ovh;
    for (const size of ADULT_SIZES) {
      sizeCosts[size] = { materialCost: mat, laborCostPerHour: labHr, manufacturingTime: time, overheadCost: ovh, totalCost: total };
    }
  }
  return sizeCosts;
}

async function migrate() {
  const snapshot = await db.collection('acc_designs').get();
  let migrated = 0, skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.sizeCosts) {
      const sizeCosts = generateSizeCosts(data);
      await doc.ref.update({ sizeCosts, updatedAt: new Date() });
      migrated++;
      console.log(`Migrated: ${data.name || doc.id}`);
    } else {
      skipped++;
    }
  }
  console.log(`Done. Migrated: ${migrated}, Skipped: ${skipped}`);
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
