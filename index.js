// index.js
require('dotenv').config();
const express       = require('express');
const bodyParser    = require('body-parser');
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

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

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
  await ensureClass();
  const client = await auth.getClient();

  // build a human‐friendly slug, then tack on a timestamp or uuid
  const slug     = req.body.subtitle.replace(/[^\w.-]/g, '_');
  const uniqueId = `${slug}_${Date.now()}`;  
  const objectId = `${issuerId}.${uniqueId}`;

  const genericObject = {
    id: objectId,
    classId: classId,
    cardTitle: {
      defaultValue: {
        language: 'en-US',
        value: req.body.subtitle
      }
    },
    header: {
      defaultValue: {
        language: 'en-US',
        value: req.body.details
      }
    },
    textModulesData: [
      { id: 'details',  body: req.body.details  },
      { id: 'subtitle', body: req.body.subtitle }
    ]
  };

  // create the new object
  await client.request({
    url:    `${baseUrl}/genericObject`,
    method: 'POST',
    data:   genericObject
  });

  const key    = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const claims = {
    iss: serviceAccount.client_email,
    aud: 'google',
    typ: 'savetowallet',
    payload: { genericObjects: [genericObject] }
  };
  const token   = jwt.sign(claims, serviceAccount.private_key, { algorithm: 'RS256' });
  const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

   // ⇨ **Return JSON** instead of HTML
 res.json({ saveUrl });
});

app.listen(PORT, () => {
  console.log(`🚀 Running on http://localhost:${PORT}`);
});
