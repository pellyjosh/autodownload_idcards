const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const puppeteer = require('puppeteer');
require("dotenv").config();

const app = express();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.PUPPETEER_STORAGE_PATH)
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['text/plain', 'text/csv', 'application/vnd.ms-excel'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
})
const upload = multer({ storage });

app.get('/', (req, res) => {
  res.send(`
    
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Upload DIN File</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0;">
        <div style="background-color: #f0f0f0; padding: 20px;">
          <form method="post" action="/" enctype="multipart/form-data">
            <label for="dinFile" style="font-size: 18px; font-weight: bold; margin-bottom: 10px; display: block;">Upload DIN file (TXT):</label>
            <input type="file" id="dinFile" name="dinFile" accept=".csv,.txt,.xlsx" style="font-size: 16px; padding: 10px; border: none; background-color: #fff; margin-bottom: 20px;">
    
            <div id="dinError" style="color: red; font-size: 14px; margin-bottom: 20px;"></div>
    
            <button type="submit" onsubmit="validateForm()" style="background-color: #4CAF50; color: #fff; border: none; padding: 10px 20px; font-size: 16px; cursor: pointer;">Submit</button>
          </form>
        </div>
    
        <script>
          function validateForm() {
            const dinFile = document.getElementById('dinFile');
            const dinError = document.getElementById('dinError');
            const file = dinFile.files[0];
    
            if (!file) {
              dinError.innerHTML = 'No file uploaded';
              return false;
            }
    
            if (file.size > 1048576) {
              dinError.innerHTML = 'File size must be less than 1 MB';
              return false;
            }
    
            const reader = new FileReader();
            reader.readAsText(file);
            reader.onload = function() {
              const dinList = reader.result.split(/\r\n|\n/);
    
              if (dinList.length < 5) {
                dinError.innerHTML = 'File must contain at least 5 DINs';
                return false;
              }
    
              if (dinList.length > 10) {
                dinError.innerHTML = 'File can contain at most 10 DINs';
                return false;
              }
    
              dinError.innerHTML = '';
              return true;
            };
          }
        </script>
      </body>
    </html>
    
  `);
});


app.post('/', upload.single('dinFile'), async (req, res) => {
  const dinList = [];
  const successfulDINs = [];
  const failedDINs = [];

  try {
    // Read the list of DIN values from the uploaded file
    const file = req.file;
    console.log('file:', file);
    if (!file) {
      res.send('No file uploaded');
      return;
    }

    if (file.mimetype === 'text/plain') {
      console.log('file path:', file.path);
      const lineReader = require('readline').createInterface({
        input: fs.createReadStream(file.path)
      });

      lineReader.on('line', (line) => {
        dinList.push(line.trim());
      });

      lineReader.on('close', async () => {
        console.log('dinList:', dinList);

        if (dinList.length < 3 || dinList.length > 6) {
          res.send('DIN list must have between 3 and 6 elements');
        } else {
          // Launch a new browser instance and create a new page
          const browser = await puppeteer.launch({
            args: [
              "--disable-setuid-sandbox",
              "--no-sandbox",
              "--single-process",
              "--no-zygote",
            ],
            executablePath:
              process.env.NODE_ENV === "production"
                ? process.env.PUPPETEER_EXECUTABLE_PATH
                : puppeteer.executablePath(),

            timeout: 60000
          });
          const page = await browser.newPage();

          // Loop through each DIN value and generate the ID card
          for (const din of dinList) {
            try {
              const portal = await page.goto(`https://www.portals.digitalehealthsolutions.com/dashboard/generate-id/${din}`, { timeout: 200000 });
              if (portal.url().includes('login')) {
                await page.type('#email', 'digiehealth@gmail.com');
                await page.type('#password', 'Virus123@');
                await page.click('#inlineRadio1');
                await page.click('body > div > div > div > div.card > form > div.text-center > button');
                await page.waitForTimeout(5000);
              }
              await page.click('#print');
              await page.waitForTimeout(5000);
              successfulDINs.push(din);
            } catch (err) {
              console.error(`Failed to generate ID card for DIN ${din}: ${err}`);
              failedDINs.push(din);
            }
          }
          await browser.close();

          // Send a response to the client indicating success or failure
          if (failedDINs.length > 0) {
            const failedDINsText = failedDINs.join('\n');
            const fileName = `failed_DINs_${Date.now()}.txt`;
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(failedDINsText);
          } else {
            const successfulDINsText = successfulDINs.join('\n');
            const fileName = `successful_DINs_${Date.now()}.txt`;
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(`Generated ${dinList.length} ID cards\n\nSuccessful DINs:\n${successfulDINsText}`);
          }
        }


      });
    } else {
      res.send('Invalid file type');
    }
  } catch (err) {
    console.error(`Failed to read file: ${err}`);
    res.send(`Failed to read file: ${err}`);
  }
});



const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});