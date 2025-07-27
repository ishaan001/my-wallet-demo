// index.js
require('dotenv').config();
const express       = require('express');
const { GoogleAuth }= require('google-auth-library');
const jwt           = require('jsonwebtoken');

const app      = express();
const PORT     = process.env.PORT || 3000;
const issuerId = process.env.ISSUER_ID;
const classId  = `${issuerId}.simple_class`;
const baseUrl  = 'https://walletobjects.googleapis.com/walletobjects/v1';

const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: 'https://www.googleapis.com/auth/wallet_object.issuer'
});

app.use(express.json());

async function ensureClass() {
  const client = await auth.getClient();
  try {
    await client.request({ url:`${baseUrl}/genericClass/${classId}`, method:'GET' });
  } catch (e) {
    if (e.response && e.response.status === 404) {
      const cls = {
        id: classId,
        classTemplateInfo: {
          /* cardTemplateOverride: {
            cardRowTemplateInfos: [{
              twoItems: {
                startItem: { firstValue: { fields: [{ fieldPath: 'object.textModulesData["details"]' }] } },
                endItem:   { firstValue: { fields: [{ fieldPath: 'object.textModulesData["subtitle"]' }] } }
              }
            }] 
          } */
        },
        textModulesData: [
          { id: 'details',  header: 'Details'},
          { id: 'subtitle', header: 'Subtitle'}
        ]
      };
      await client.request({ url:`${baseUrl}/genericClass`, method:'POST', data:cls });
      console.log('✅ Created class');
    } else {
      console.error(e);
    }
  }
}

app.post('/create', async (req, res) => {
  try {
    const { title, subtitle } = req.body;
    if (!title || !subtitle) {
      return res
        .status(400)
        .json({ error: 'Both "title" and "subtitle" are required.' });
    }

    // 1) ensure your class exists
    await ensureClass();
    const client = await auth.getClient();

    // 2) make a unique object ID
    const slug     = title.replace(/[^\w.-]/g, '_');
    const uniqueId = `${slug}_${Date.now()}`;
    const objectId = `${issuerId}.${uniqueId}`;

    // 3) build your Wallet object
    const genericObject = {
      id:      objectId,
      classId: classId,
      cardTitle: {
        defaultValue: { language: 'en-US', value: title }
      },
      header: {
        defaultValue: { language: 'en-US', value: subtitle }
      },
      textModulesData: [
        // you can drop or rename fields here as your class template expects
        { id: 'details',  body: subtitle },
        { id: 'subtitle', body: title }
      ]
    };

    // 4) push it to Google
    await client.request({
      url:    `${baseUrl}/genericObject`,
      method: 'POST',
      data:   genericObject
    });

    // 5) build your Save‑to‑Wallet JWT
    const claims = {
      iss:     serviceAccount.client_email,
      aud:     'google',
      typ:     'savetowallet',
      payload: { genericObjects: [genericObject] }
    };
    const token   = jwt.sign(claims, serviceAccount.private_key, { algorithm: 'RS256' });
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    // 6) return just the URL
    res.json({ saveUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Running on http://localhost:${PORT}`);
});
