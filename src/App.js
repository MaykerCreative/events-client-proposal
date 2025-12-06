// ============================================
// COMPLETE GOOGLE APPS SCRIPT CODE
// Copy this entire file to your Code.gs in Google Apps Script
// ============================================

// Configuration - Update these with your Sheet IDs
const SHEET_ID = '1QG_yHivyIAUaixZobcgDfz6Tzjt9_2ndkIkyZT2WkJ0';
const CATALOG_ID = '116B97xSSUIDDdDLP6vWch4_BIxbEwPLdLO9FtBQZheU';

// Slack Webhook URL - Replace with your Slack webhook URL
// To get a webhook URL: https://api.slack.com/messaging/webhooks
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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';

// Timezone mapping by state (for automatic timezone detection)
// Add more states as needed
const STATE_TIMEZONES = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DC': 'America/New_York', 'DE': 'America/New_York',
  'FL': 'America/New_York', 'GA': 'America/New_York', 'HI': 'Pacific/Honolulu',
  'ID': 'America/Denver', 'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis',
  'IA': 'America/Chicago', 'KS': 'America/Chicago', 'KY': 'America/New_York',
  'LA': 'America/Chicago', 'ME': 'America/New_York', 'MD': 'America/New_York',
  'MA': 'America/New_York', 'MI': 'America/Detroit', 'MN': 'America/Chicago',
  'MS': 'America/Chicago', 'MO': 'America/Chicago', 'MT': 'America/Denver',
  'NE': 'America/Chicago', 'NV': 'America/Los_Angeles', 'NH': 'America/New_York',
  'NJ': 'America/New_York', 'NM': 'America/Denver', 'NY': 'America/New_York',
  'NC': 'America/New_York', 'ND': 'America/Chicago', 'OH': 'America/New_York',
  'OK': 'America/Chicago', 'OR': 'America/Los_Angeles', 'PA': 'America/New_York',
  'RI': 'America/New_York', 'SC': 'America/New_York', 'SD': 'America/Chicago',
  'TN': 'America/Chicago', 'TX': 'America/Chicago', 'UT': 'America/Denver',
  'VT': 'America/New_York', 'VA': 'America/New_York', 'WA': 'America/Los_Angeles',
  'WV': 'America/New_York', 'WI': 'America/Chicago', 'WY': 'America/Denver'
};

// ============================================
// MAIN FUNCTIONS
// ============================================

function doGet(e) {
  try {
    // Handle change requests retrieval
    const params = e?.parameter || {};
    if (params.action === 'getChangeRequests') {
      return getChangeRequests();
    }
    
    // Handle new project submissions retrieval
    if (params.action === 'getNewProjectSubmissions') {
      return getNewProjectSubmissions();
    }
    
    // Handle catalog retrieval
    if (params.action === 'getCatalog') {
      const catalogSpreadsheet = SpreadsheetApp.openById(CATALOG_ID);
      const catalogSheet = catalogSpreadsheet.getSheetByName('Current Catalog');
      const catalogData = catalogSheet.getDataRange().getValues();
      
      const catalogProducts = [];
      catalogData.slice(1).forEach(row => {
        const productName = row[0];
        const price = parseFloat(row[2]) || 0;
        const dimensions = row[3] || '';
        const driveFileId = row[4] || '';
        const imageUrl = driveFileId ? `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w400` : '';
        
        if (productName) {
          catalogProducts.push({
            name: productName,
            price: price,
            imageUrl: imageUrl,
            dimensions: dimensions
          });
        }
      });
      
      catalogProducts.sort((a, b) => a.name.localeCompare(b.name));
      
      return ContentService.createTextOutput(JSON.stringify({
        catalog: catalogProducts
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    const catalogSpreadsheet = SpreadsheetApp.openById(CATALOG_ID);
    const catalogSheet = catalogSpreadsheet.getSheetByName('Current Catalog');
    const catalogData = catalogSheet.getDataRange().getValues();
    
    const productCatalog = {};
    const catalogProducts = [];
    
    catalogData.slice(1).forEach(row => {
      const productName = row[0];
      const price = parseFloat(row[2]) || 0;
      const dimensions = row[3] || '';
      const driveFileId = row[4] || '';
      const imageUrl = driveFileId ? `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w400` : '';
      
      if (productName) {
        productCatalog[productName.toUpperCase()] = {
          price: price,
          imageUrl: imageUrl,
          dimensions: dimensions
        };
        catalogProducts.push({
          name: productName,
          price: price,
          imageUrl: imageUrl,
          dimensions: dimensions
        });
      }
    });
    
    catalogProducts.sort((a, b) => a.name.localeCompare(b.name));
    
    const headers = data[0];
    const rows = data.slice(1);
    
    const proposals = rows.map(row => {
      const startDate = row[5] ? new Date(row[5]) : null;
      const endDate = row[6] ? new Date(row[6]) : null;
      
      let eventDate = '';
      if (startDate && endDate) {
        const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
        const startDay = startDate.getDate();
        const endDay = endDate.getDate();
        const year = startDate.getFullYear();
        
        // Fix single day formatting
        if (startMonth === endMonth && startDay === endDay) {
          eventDate = `${startMonth} ${startDay}, ${year}`;
        } else if (startMonth === endMonth) {
          eventDate = `${startMonth} ${startDay}-${endDay}, ${year}`;
        } else {
          eventDate = `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
        }
      }
      
      const rawProductText = String(row[13] || '').trim();
      // Check if the data is already JSON (starts with '[') - if so, use it directly
      // Otherwise, parse from legacy text format for backward compatibility
      let sectionsJSON;
      if (rawProductText.startsWith('[') || rawProductText.startsWith('{')) {
        // It's already JSON - use it directly, but ensure note fields exist
        try {
          const sections = JSON.parse(rawProductText);
          // Ensure all products have note field for backward compatibility
          const sectionsWithNotes = sections.map(section => {
            if (section.products && Array.isArray(section.products)) {
              return {
                ...section,
                products: section.products.map(product => ({
                  ...product,
                  note: product.note || ''
                }))
              };
            }
            return section;
          });
          sectionsJSON = JSON.stringify(sectionsWithNotes);
        } catch (err) {
          Logger.log('Error parsing JSON sections, falling back to text parsing: ' + err.toString());
          sectionsJSON = parseProductsFromText(rawProductText, productCatalog);
        }
      } else {
        // Legacy text format - parse it
        sectionsJSON = parseProductsFromText(rawProductText, productCatalog);
      }
      const salesLeadValue = row[14] ? String(row[14]).trim() : '';
      const statusValue = row[15] ? String(row[15]).trim() : 'Pending';
      const projectNumber = row[16] ? String(row[16]).trim() : '';
      const taxExempt = row[17] === true || row[17] === 'true' || String(row[17] || '').toLowerCase() === 'true';
      const versionFromColumn = row[18] ? String(row[18]).trim() : ''; // Column S - Version (may be redundant with version extracted from client name)
      const customRentalMultiplier = row[19] ? String(row[19]).trim() : ''; // Column T - Custom Rental Multiplier
      const miscFees = row[20] ? String(row[20]).trim() : '[]'; // Column U - Misc Fees
      const customProjectNotes = row[21] ? String(row[21]).trim() : ''; // Column V - Custom Project Notes
      
      // Extract version from client name
      const clientNameWithVersion = String(row[1] || '').trim();
      const versionMatch = clientNameWithVersion.match(/\(V(\d+)\)$/);
      const version = versionMatch ? parseInt(versionMatch[1]) : null;
      const clientName = clientNameWithVersion.replace(/\s*\(V\d+\)\s*$/, '').trim();
      
      const deliveryTime = formatTimeFromSerial(row[7]);
      const strikeTime = formatTimeFromSerial(row[8]);
      
      // Get timezone from state (or use default if not found)
      const stateCode = String(row[4] || '').trim().toUpperCase();
      const timezone = STATE_TIMEZONES[stateCode] || 'America/Chicago'; // Default to Central
      
      return {
        timestamp: row[0],
        lastUpdated: row[0] ? formatDateTime(new Date(row[0])) : '',
        clientName: clientName,
        version: version,
        venueName: row[2] || '',
        city: row[3] || '',
        state: row[4] || '',
        startDate: startDate ? formatDateForInput(startDate) : '',
        endDate: endDate ? formatDateForInput(endDate) : '',
        eventDate: eventDate,
        deliveryTime: deliveryTime,
        strikeTime: strikeTime,
        timezone: timezone, // Add timezone to response
        deliveryFee: String(row[9] || '0'),
        discount: String(row[10] || '0'),
        discountName: row[11] || '',
        clientFolderURL: row[12] || '',
        salesLead: salesLeadValue,
        status: statusValue,
        projectNumber: projectNumber,
        customRentalMultiplier: customRentalMultiplier,
        taxExempt: taxExempt,
        miscFees: miscFees,
        customProjectNotes: customProjectNotes,
        sectionsJSON: sectionsJSON
      };
    }).filter(proposal => proposal.clientName && proposal.clientName.trim() !== '');
    
    Logger.log('Returning ' + proposals.length + ' proposals and ' + catalogProducts.length + ' catalog items');
    
    return ContentService.createTextOutput(JSON.stringify({
      proposals: proposals,
      catalog: catalogProducts
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    Logger.log('=== doPost called ===');
    Logger.log('postData exists: ' + (e.postData ? 'Yes' : 'No'));
    Logger.log('postData.contents length: ' + (e.postData ? e.postData.contents.length : 0));
    
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
      Logger.log('Payload parsed successfully');
    } catch (parseError) {
      Logger.log('ERROR parsing JSON: ' + parseError.toString());
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Failed to parse JSON: ' + parseError.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log('Payload keys: ' + Object.keys(payload).join(', '));
    Logger.log('Payload type: ' + (payload.type || 'proposal'));
    
    // Handle new project submission
    if (payload.type === 'submitNewProject') {
      Logger.log('=== NEW PROJECT SUBMISSION DETECTED ===');
      Logger.log('Venue: ' + (payload.venueName || 'N/A'));
      Logger.log('Address: ' + (payload.venueAddress || 'N/A'));
      return saveNewProjectSubmission(payload);
    }
    
    // Handle change request submission
    if (payload.type === 'changeRequest') {
      Logger.log('=== CHANGE REQUEST DETECTED ===');
      Logger.log('Project: ' + (payload.projectNumber || 'N/A'));
      Logger.log('Client: ' + (payload.originalProposal?.clientName || 'N/A'));
      return saveChangeRequest(payload);
    }
    
    // Handle marking change request as reviewed
    if (payload.type === 'markChangeRequestReviewed') {
      return markChangeRequestReviewed(payload.changeRequestId);
    }
    
    // Handle proposal approval
    if (payload.type === 'approveProposal') {
      return approveProposal(payload);
    }
    
    Logger.log('customRentalMultiplier in payload: ' + (payload.customRentalMultiplier || 'EMPTY/UNDEFINED'));
    
    // Handle image upload action (before processing proposal save)
    if (payload.action === 'uploadImage') {
      return handleImageUpload(payload);
    }
    
    Logger.log('generatePDF in payload: ' + (payload.generatePDF !== undefined ? payload.generatePDF : 'undefined'));
    Logger.log('clientFolderURL in payload: ' + (payload.clientFolderURL ? 'provided (' + payload.clientFolderURL.length + ' chars)' : 'missing'));
    Logger.log('pdfBase64 in payload: ' + (payload.pdfBase64 ? 'provided (' + payload.pdfBase64.length + ' chars)' : 'missing'));
    
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    let baseClientName = String(payload.clientName).trim();
    baseClientName = baseClientName.replace(/\s*\(V\d+\)\s*$/g, '').trim();
    
    Logger.log('Processing: ' + baseClientName);
    Logger.log('Payload received: ' + JSON.stringify(payload));
    
    let highestVersion = 0;
    // Get projectNumber from payload, but treat empty string as "no project number" (new proposal)
    let projectNumber = payload.projectNumber && String(payload.projectNumber).trim() !== '' ? String(payload.projectNumber).trim() : '';
    const versionRowMap = {};
    
    // Only check for existing versions if projectNumber is provided and not empty (meaning it's an edit)
    // If no projectNumber is provided, it's a NEW proposal and should start at V1
    if (projectNumber && projectNumber !== '') {
      // Find existing versions for this project number
      for (let i = 1; i < data.length; i++) {
        const rowProjectNumber = String(data[i][16] || '').trim();
        
        if (rowProjectNumber === projectNumber) {
          // Same project number - find version
          const rowClientName = String(data[i][1] || '').trim();
          const versionMatch = rowClientName.match(/\(V(\d+)\)$/);
          if (versionMatch) {
            const version = parseInt(versionMatch[1]);
            highestVersion = Math.max(highestVersion, version);
            versionRowMap[version] = i;
          } else {
            // Original version (no V#) - treat as V1
            const rowBaseName = rowClientName.replace(/\s*\(V\d+\)\s*$/, '').trim();
            if (rowBaseName === baseClientName) {
              highestVersion = Math.max(highestVersion, 1);
              versionRowMap[1] = i;
            }
          }
        }
      }
    }
    // If no projectNumber provided, highestVersion stays 0, so nextVersion will be 1 (correct for new proposals)
    
    // Generate new project number if needed
    if (!projectNumber) {
      projectNumber = generateProjectNumber(sheet);
      Logger.log('Generated new project number: ' + projectNumber);
    }
    
    Logger.log('Using project number: ' + projectNumber);
    
    // Update status for all previous versions if status changes to Pending or Cancelled
    if (highestVersion > 0) {
      const highestVersionRow = versionRowMap[highestVersion];
      if (highestVersionRow !== undefined) {
        const currentHighestStatus = String(data[highestVersionRow][15] || 'Pending').trim();
        const newStatus = payload.status || 'Pending';
        
        if (currentHighestStatus !== newStatus && (newStatus === 'Pending' || newStatus === 'Cancelled')) {
          Logger.log('Status is changing TO ' + newStatus + ', updating all versions to: ' + newStatus);
          for (let version = 1; version <= highestVersion; version++) {
            const rowIndex = versionRowMap[version];
            if (rowIndex !== undefined) {
              sheet.getRange(rowIndex + 1, 16).setValue(newStatus);
              Logger.log('Updated V' + version + ' (row ' + (rowIndex + 1) + ') to status: ' + newStatus);
            }
          }
        }
      }
    }
    
    const nextVersion = highestVersion + 1;
    const versionedClientName = nextVersion > 1 ? baseClientName + ' (V' + nextVersion + ')' : baseClientName;
    
    Logger.log('Creating new version: ' + versionedClientName);
    
    // Store the full JSON string directly to preserve all fields (notes, dimensions, etc.)
    // This ensures notes and other product fields are not lost
    let proposalSectionsText = '';
    if (payload.sectionsJSON) {
      try {
        // Validate it's valid JSON, then store it directly
        const sections = JSON.parse(payload.sectionsJSON);
        // Store the full JSON string to preserve all fields including notes
        proposalSectionsText = payload.sectionsJSON;
        Logger.log('Storing full JSON with ' + sections.length + ' sections');
      } catch (err) {
        Logger.log('Error parsing sectionsJSON: ' + err.toString());
        proposalSectionsText = payload.sectionsJSON;
      }
    }
    
    const cleanStartDate = payload.startDate ? String(payload.startDate).split('T')[0] : '';
    const cleanEndDate = payload.endDate ? String(payload.endDate).split('T')[0] : '';
    const formattedDeliveryTime = formatTimeForSheet(payload.deliveryTime);
    const formattedStrikeTime = formatTimeForSheet(payload.strikeTime);
    
    // Get timezone from payload or auto-detect from state
    const stateCode = String(payload.state || '').trim().toUpperCase();
    const timezone = payload.timezone || STATE_TIMEZONES[stateCode] || 'America/Chicago';
    
    // Note: Timezone is not stored in the sheet currently, but is calculated on-the-fly
    // If you want to store it, add a new column and include it in newRow array
    
    const newRow = [
      new Date(),
      versionedClientName,
      payload.venueName || '',
      payload.city || '',
      payload.state || '',
      cleanStartDate,
      cleanEndDate,
      formattedDeliveryTime,
      formattedStrikeTime,
      payload.deliveryFee || '',
      payload.discount || '',
      payload.discountName || '',
      payload.clientFolderURL || '',
      proposalSectionsText,
      payload.salesLead || '',
      payload.status || 'Pending',
      projectNumber,
      payload.taxExempt || false,
      nextVersion, // Column S - Version
      payload.customRentalMultiplier || '', // Column T - Custom Rental Multiplier
      payload.miscFees || '[]', // Column U - Misc Fees
      payload.customProjectNotes || '' // Column V - Custom Project Notes
    ];
    
    Logger.log('Saving customRentalMultiplier to column 17: ' + (payload.customRentalMultiplier || 'EMPTY'));
    Logger.log('newRow length: ' + newRow.length + ', column 17 value: ' + newRow[17]);
    
    sheet.appendRow(newRow);
    Logger.log('Saved row with client name: ' + versionedClientName);
    
    // ============================================
    // PDF GENERATION AND UPLOAD
    // ============================================
    Logger.log('PDF upload check - generatePDF: ' + payload.generatePDF + ', clientFolderURL: ' + (payload.clientFolderURL ? 'provided' : 'missing'));
    if (payload.generatePDF && payload.clientFolderURL) {
      try {
        Logger.log('Attempting PDF upload...');
        Logger.log('PDF base64 provided: ' + (payload.pdfBase64 ? 'Yes (length: ' + payload.pdfBase64.length + ')' : 'No'));
        // The frontend generates the PDF and sends it as base64
        // This ensures the PDF matches exactly what the user sees
        const pdfFileId = generateAndUploadPDF(
          payload,
          nextVersion,
          payload.clientFolderURL,
          payload.pdfBase64 || null  // PDF base64 from frontend
        );
        if (pdfFileId) {
          Logger.log('PDF successfully uploaded to Drive. File ID: ' + pdfFileId);
        } else {
          Logger.log('PDF upload was skipped (no folder URL or extraction failed)');
        }
      } catch (error) {
        Logger.log('PDF upload failed, but proposal was saved: ' + error.toString());
        Logger.log('Error stack: ' + error.stack);
        // Don't fail the entire save if PDF upload fails
      }
    } else {
      Logger.log('PDF upload skipped - generatePDF: ' + payload.generatePDF + ', clientFolderURL: ' + (payload.clientFolderURL ? 'provided' : 'missing'));
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      clientName: versionedClientName,
      projectNumber: projectNumber,
      version: nextVersion,
      message: 'Proposal saved successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// PDF GENERATION FUNCTIONS
// ============================================

function generateAndUploadPDF(proposalData, version, clientFolderURL, pdfBase64) {
  try {
    Logger.log('generateAndUploadPDF called with version: ' + version);
    
    if (!clientFolderURL || clientFolderURL.trim() === '') {
      Logger.log('No client folder URL provided, skipping PDF upload');
      return null;
    }
    
    Logger.log('Client folder URL: ' + clientFolderURL);
    
    // Extract folder ID from URL
    const folderId = extractFolderIdFromURL(clientFolderURL);
    if (!folderId) {
      Logger.log('ERROR: Could not extract folder ID from URL: ' + clientFolderURL);
      return null;
    }
    
    Logger.log('Extracted folder ID: ' + folderId);
    
    // Generate PDF filename
    const filename = generatePDFFilename(proposalData, version);
    Logger.log('Generated filename: ' + filename);
    
    // If PDF base64 is provided (from frontend), use it directly
    // Otherwise, fall back to generating from HTML (legacy method)
    let pdfBlob;
    
    if (pdfBase64 && pdfBase64.trim() !== '') {
      Logger.log('Using PDF from frontend (exact match of rendered view)');
      try {
        // Decode base64 PDF from frontend
        const pdfBytes = Utilities.base64Decode(pdfBase64);
        pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', filename);
        Logger.log('PDF blob created, size: ' + pdfBlob.getBytes().length + ' bytes');
      } catch (decodeError) {
        Logger.log('ERROR decoding PDF base64: ' + decodeError.toString());
        throw decodeError;
      }
    } else {
      // Fallback: Generate PDF from HTML (won't be exact match)
      Logger.log('WARNING: No PDF base64 provided, generating from HTML (may not match exactly)');
      const htmlContent = generateProposalHTML(proposalData);
      pdfBlob = htmlToPdfBlob(htmlContent);
    }
    
    // Upload to Drive folder
    Logger.log('Attempting to access Drive folder: ' + folderId);
    try {
      const folder = DriveApp.getFolderById(folderId);
      Logger.log('Folder accessed successfully: ' + folder.getName());
      
      Logger.log('Creating file in folder...');
      const file = folder.createFile(pdfBlob);
      file.setName(filename);
      
      Logger.log('PDF uploaded successfully! File ID: ' + file.getId() + ', Name: ' + filename);
      return file.getId();
    } catch (driveError) {
      Logger.log('ERROR accessing Drive folder: ' + driveError.toString());
      Logger.log('Make sure Drive API is enabled and the folder ID is correct');
      throw driveError;
    }
    
  } catch (error) {
    Logger.log('ERROR in generateAndUploadPDF: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return null;
  }
}

function extractFolderIdFromURL(url) {
  try {
    // Handle different Google Drive URL formats
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (error) {
    Logger.log('Error extracting folder ID: ' + error.toString());
    return null;
  }
}

// ============================================
// IMAGE UPLOAD FUNCTION
// ============================================

function handleImageUpload(payload) {
  try {
    Logger.log('=== handleImageUpload called ===');
    
    if (!payload.clientFolderURL || payload.clientFolderURL.trim() === '') {
      Logger.log('ERROR: Client folder URL is required');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Client folder URL is required'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (!payload.imageBase64) {
      Logger.log('ERROR: Image data is required');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Image data is required'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Extract folder ID from URL
    const folderId = extractFolderIdFromURL(payload.clientFolderURL);
    if (!folderId) {
      Logger.log('ERROR: Could not extract folder ID from URL: ' + payload.clientFolderURL);
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Could not extract folder ID from URL'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log('Folder ID extracted: ' + folderId);
    
    // Decode base64 image
    const imageBytes = Utilities.base64Decode(payload.imageBase64);
    const mimeType = payload.mimeType || 'image/jpeg';
    const imageName = payload.imageName || 'image.jpg';
    const imageBlob = Utilities.newBlob(imageBytes, mimeType, imageName);
    
    Logger.log('Image blob created, size: ' + imageBlob.getBytes().length + ' bytes');
    
    // Upload to Drive folder
    try {
      const folder = DriveApp.getFolderById(folderId);
      Logger.log('Folder accessed successfully: ' + folder.getName());
      
      const file = folder.createFile(imageBlob);
      file.setName(imageName);
      
      // Make file viewable by anyone with the link
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const fileId = file.getId();
      Logger.log('Image uploaded successfully! File ID: ' + fileId + ', Name: ' + imageName);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        fileId: fileId,
        fileUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
        message: 'Image uploaded successfully'
      })).setMimeType(ContentService.MimeType.JSON);
      
    } catch (driveError) {
      Logger.log('ERROR accessing Drive folder: ' + driveError.toString());
      Logger.log('Make sure Drive API is enabled and the folder ID is correct');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Drive error: ' + driveError.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    Logger.log('ERROR in handleImageUpload: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function generatePDFFilename(proposalData, version) {
  const clientName = String(proposalData.clientName || '').trim();
  const venueName = String(proposalData.venueName || '').trim();
  
  // Format event date using timezone-safe parsing
  let eventDate = '';
  if (proposalData.startDate && proposalData.endDate) {
    const startDate = parseDateSafely(proposalData.startDate);
    const endDate = parseDateSafely(proposalData.endDate);
    
    if (startDate && endDate) {
      const startMonth = startDate.toLocaleDateString('en-US', { month: 'long' });
      const endMonth = endDate.toLocaleDateString('en-US', { month: 'long' });
      const startDay = startDate.getDate();
      const endDay = endDate.getDate();
      const year = startDate.getFullYear();
      
      if (startMonth === endMonth && startDay === endDay) {
        eventDate = `${startMonth} ${startDay}, ${year}`;
      } else if (startMonth === endMonth) {
        eventDate = `${startMonth} ${startDay}-${endDay}, ${year}`;
      } else {
        eventDate = `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
      }
    }
  }
  
  const filename = `(V${version}) ${clientName} - ${venueName} - ${eventDate} - Mayker Events Rental Proposal`;
  return filename;
}

function htmlToPdfBlob(htmlContent) {
  // Method 1: Use HtmlService (works but has some styling limitations)
  try {
    const htmlOutput = HtmlService.createHtmlOutput(htmlContent);
    htmlOutput.setWidth(816); // 8.5 inches at 96 DPI
    htmlOutput.setHeight(1056); // 11 inches at 96 DPI
    
    const blob = htmlOutput.getAs('application/pdf');
    return blob;
  } catch (error) {
    Logger.log('Error creating PDF with HtmlService: ' + error.toString());
    return createSimplePDFDocument(htmlContent);
  }
}

function createSimplePDFDocument(htmlContent) {
  // Fallback method: Create a Google Doc with proposal info and export as PDF
  try {
    const doc = DocumentApp.create('Proposal PDF');
    const body = doc.getBody();
    
    body.appendParagraph('Mayker Events Rental Proposal')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .setForegroundColor('#2C2C2C');
    
    body.appendParagraph('This PDF was automatically generated when saving a new proposal version.')
      .setForegroundColor('#888888');
    
    // Export as PDF
    const pdfBlob = doc.getAs('application/pdf');
    
    // Delete the temporary document
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    
    return pdfBlob;
  } catch (error) {
    Logger.log('Error creating fallback PDF: ' + error.toString());
    throw error;
  }
}

function generateProposalHTML(proposalData) {
  // Simplified HTML template (fallback only - frontend PDF is preferred)
  const sections = JSON.parse(proposalData.sectionsJSON || '[]');
  const brandTaupe = '#545142';
  const brandCharcoal = '#2C2C2C';
  
  let sectionsHTML = '';
  sections.forEach(section => {
    sectionsHTML += `<div style="page-break-after: always; padding: 30px 60px;">
      <h2 style="font-size: 18px; font-weight: 400; color: ${brandCharcoal}; text-transform: uppercase; letter-spacing: 0.05em;">${section.name}</h2>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
    `;
    
    section.products.forEach(product => {
      sectionsHTML += `
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px;">
          <div style="aspect-ratio: 1; background-color: #e5e5e5; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #999; overflow: hidden; border-radius: 2px;">
            ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : '[Product Image]'}
          </div>
          <h3 style="font-size: 11px; font-weight: 500; color: ${brandCharcoal}; text-transform: uppercase; margin-bottom: 4px;">${product.name}</h3>
          <p style="font-size: 10px; color: #666; margin-bottom: 4px;">Quantity: ${product.quantity}</p>
          ${product.dimensions ? `<p style="font-size: 10px; color: #666;">${product.dimensions}</p>` : ''}
        </div>
      `;
    });
    
    sectionsHTML += `</div></div>`;
  });
  
  // Format dates safely for display
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = parseDateSafely(dateStr);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: letter; margin: 0; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      <!-- Cover Page -->
      <div style="background-color: ${brandTaupe}; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 48px;">
        <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 80px;">
          <div style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
            <p style="font-size: 14px; color: white; letter-spacing: 0.1em; margin-bottom: 16px; text-transform: uppercase;">Product Selections</p>
            <p style="font-size: 18px; color: white; margin-bottom: 6px; font-weight: 300;">${proposalData.clientName}</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.9); margin-bottom: 4px;">${proposalData.venueName}</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.9);">${formatEventDate(proposalData)}</p>
          </div>
        </div>
      </div>
      
      ${sectionsHTML}
      
      <!-- Project Details Page -->
      <div style="padding: 30px 60px; page-break-after: always;">
        <h2 style="font-size: 16px; font-weight: 400; color: ${brandCharcoal}; text-transform: uppercase; letter-spacing: 0.05em;">Project Details</h2>
        <p style="margin-bottom: 24px; font-size: 12px; line-height: 1.6; color: #444;">
          The project fee quoted is based on the current scope of rentals, as well as the delivery details below. If your requirements change, delivery fees may adjust accordingly:
        </p>
        <ul style="font-size: 12px; line-height: 1.8; margin-bottom: 20px; color: #222; list-style: none; padding: 0;">
          <li style="margin-bottom: 8px;"><strong>Project Location:</strong> ${proposalData.venueName}, ${proposalData.city}, ${proposalData.state}</li>
          <li style="margin-bottom: 8px;"><strong>Delivery Date:</strong> ${formatDateForDisplay(proposalData.startDate)}</li>
          <li style="margin-bottom: 8px;"><strong>Preferred Delivery Window:</strong> ${proposalData.deliveryTime || ''}</li>
          <li style="margin-bottom: 8px;"><strong>Pick-Up Date:</strong> ${formatDateForDisplay(proposalData.endDate)}</li>
          <li style="margin-bottom: 8px;"><strong>Preferred Pick-Up Window:</strong> ${proposalData.strikeTime || ''}</li>
        </ul>
      </div>
    </body>
    </html>
  `;
}

function formatEventDate(proposalData) {
  if (!proposalData.startDate || !proposalData.endDate) return '';
  // Parse dates in a timezone-safe way
  const start = parseDateSafely(proposalData.startDate);
  const end = parseDateSafely(proposalData.endDate);
  if (!start || !end) return '';
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();
  
  if (startMonth === endMonth && startDay === endDay) {
    return `${startMonth} ${startDay}, ${year}`;
  } else if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }
}

// Parse date string (YYYY-MM-DD) in a timezone-safe way
// This prevents dates from shifting due to UTC conversion
function parseDateSafely(dateStr) {
  if (!dateStr) return null;
  
  // If it's already a Date object, return it
  if (dateStr instanceof Date) {
    return dateStr;
  }
  
  // If it's a string in YYYY-MM-DD format, parse it as local date
  const dateMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // Month is 0-indexed
    const day = parseInt(dateMatch[3], 10);
    return new Date(year, month, day);
  }
  
  // Fallback to standard Date parsing
  return new Date(dateStr);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTimeFromSerial(serialTime) {
  if (!serialTime || serialTime === '') return '';
  let seconds = 0;
  
  if (typeof serialTime === 'number') {
    seconds = Math.round(serialTime);
  } else if (typeof serialTime === 'string' && !isNaN(serialTime)) {
    seconds = Math.round(parseFloat(serialTime));
  } else if (typeof serialTime === 'object' && serialTime.getHours) {
    const hours = serialTime.getHours();
    const minutes = serialTime.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`;
  } else {
    return String(serialTime);
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

function formatTimeForSheet(timeStr) {
  if (!timeStr || timeStr.trim() === '') return '';
  try {
    const parts = timeStr.trim().split(' ');
    if (parts.length !== 2) {
      Logger.log('Invalid time format: ' + timeStr);
      return timeStr;
    }
    return timeStr.trim();
  } catch (e) {
    Logger.log('Error formatting time: ' + e.toString());
    return timeStr;
  }
}

function generateProjectNumber(sheet) {
  const data = sheet.getDataRange().getValues();
  let maxNumber = 0;
  
  for (let i = 1; i < data.length; i++) {
    const projNum = String(data[i][16] || '').trim();
    if (projNum && !isNaN(parseInt(projNum))) {
      const num = parseInt(projNum);
      maxNumber = Math.max(maxNumber, num);
    }
  }
  
  const nextNumber = maxNumber + 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');
  Logger.log('Generated new project number: ' + paddedNumber);
  return paddedNumber;
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

function parseProductsFromText(text, productCatalog) {
  if (!text || text.trim() === '') {
    Logger.log('Text is empty');
    return JSON.stringify([]);
  }
  
  const sections = [];
  let currentSection = null;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  Logger.log('Total lines to process: ' + lines.length);
  
  lines.forEach((line, idx) => {
    const isSectionHeader = !line.startsWith('-') && line.length > 0;
    
    if (isSectionHeader && !line.includes(',')) {
      if (currentSection && currentSection.products.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        name: line,
        products: []
      };
    } else if (line.startsWith('-') && currentSection) {
      const productPart = line.substring(1).trim();
      const parts = productPart.split(',');
      
      if (parts.length >= 2) {
        const productName = parts[0].trim();
        const quantity = parseInt(parts[1].trim()) || 1;
        
        let catalogEntry = productCatalog[productName.toUpperCase()];
        if (!catalogEntry) {
          const simplifiedName = productName.replace(/\s*\([^)]*\)\s*/g, '').toUpperCase();
          catalogEntry = productCatalog[simplifiedName];
        }
        
        if (catalogEntry) {
          currentSection.products.push({
            name: productName,
            quantity: quantity,
            price: catalogEntry.price,
            imageUrl: catalogEntry.imageUrl,
            dimensions: catalogEntry.dimensions || '',
            note: '' // Initialize note field for legacy data
          });
        } else {
          currentSection.products.push({
            name: productName,
            quantity: quantity,
            price: 0,
            imageUrl: '',
            dimensions: '',
            note: '' // Initialize note field for legacy data
          });
        }
      }
    }
  });
  
  if (currentSection && currentSection.products.length > 0) {
    sections.push(currentSection);
  }
  
  return JSON.stringify(sections);
}

// ============================================
// CHANGE REQUEST FUNCTIONS
// ============================================

// Get or create the Change Requests sheet
function getChangeRequestsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let changeRequestsSheet = spreadsheet.getSheetByName('Change Requests');
  
  if (!changeRequestsSheet) {
    // Create the sheet if it doesn't exist
    changeRequestsSheet = spreadsheet.insertSheet('Change Requests');
    
    // Set up headers
    const headers = [
      'ID',
      'Timestamp',
      'Project Number',
      'Version',
      'Client Name',
      'Reviewed',
      'Reviewed Date',
      'Change Request Data (JSON)'
    ];
    changeRequestsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    changeRequestsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    changeRequestsSheet.setFrozenRows(1);
  }
  
  return changeRequestsSheet;
}

// Save a change request
function saveChangeRequest(payload) {
  try {
    Logger.log('Saving change request for project: ' + payload.projectNumber);
    
    const sheet = getChangeRequestsSheet();
    const timestamp = new Date();
    const id = timestamp.getTime().toString() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Store the full change request data as JSON
    const changeRequestData = JSON.stringify({
      type: payload.type,
      projectNumber: payload.projectNumber,
      version: payload.version,
      timestamp: payload.timestamp,
      changes: payload.changes,
      originalProposal: payload.originalProposal
    });
    
    const newRow = [
      id,
      timestamp,
      payload.projectNumber || '',
      payload.version || '',
      payload.originalProposal?.clientName || '',
      false, // Reviewed
      '', // Reviewed Date
      changeRequestData
    ];
    
    sheet.appendRow(newRow);
    Logger.log('Change request saved with ID: ' + id);
    
    // Send Slack notification
    try {
      Logger.log('Preparing Slack notification...');
      const slackMessage = formatChangeRequestForSlack(payload);
      Logger.log('Slack message formatted, length: ' + slackMessage.length);
      sendSlackNotification(slackMessage);
      Logger.log('Slack notification call completed');
    } catch (slackError) {
      Logger.log('Error in Slack notification process: ' + slackError.toString());
      Logger.log('Slack error stack: ' + slackError.stack);
      // Continue even if Slack fails
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      changeRequestId: id
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error saving change request: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Get all change requests
function getChangeRequests() {
  try {
    const sheet = getChangeRequestsSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      // Only headers, no data
      return ContentService.createTextOutput(JSON.stringify({
        changeRequests: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const changeRequests = [];
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = row[0];
      const timestamp = row[1];
      const projectNumber = row[2];
      const version = row[3];
      const clientName = row[4];
      const reviewed = row[5] === true || row[5] === 'TRUE' || row[5] === 'true';
      const reviewedDate = row[6];
      const changeRequestDataStr = row[7];
      
      try {
        const changeRequestData = JSON.parse(changeRequestDataStr);
        changeRequests.push({
          id: id,
          timestamp: timestamp ? timestamp.toISOString() : changeRequestData.timestamp,
          reviewed: reviewed,
          reviewedDate: reviewedDate ? reviewedDate.toISOString() : null,
          originalProposal: changeRequestData.originalProposal || {
            projectNumber: projectNumber,
            version: version,
            clientName: clientName
          },
          changes: changeRequestData.changes || {}
        });
      } catch (parseError) {
        Logger.log('Error parsing change request data for row ' + (i + 1) + ': ' + parseError.toString());
        // Skip this row if JSON is invalid
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      changeRequests: changeRequests
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error getting change requests: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString(),
      changeRequests: []
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Mark a change request as reviewed
function markChangeRequestReviewed(changeRequestId) {
  try {
    Logger.log('Marking change request as reviewed: ' + changeRequestId);
    
    const sheet = getChangeRequestsSheet();
    const data = sheet.getDataRange().getValues();
    
    // Find the row with matching ID
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(changeRequestId)) {
        // Update reviewed status and date
        sheet.getRange(i + 1, 6).setValue(true); // Reviewed column
        sheet.getRange(i + 1, 7).setValue(new Date()); // Reviewed Date column
        Logger.log('Change request marked as reviewed');
        
        return ContentService.createTextOutput(JSON.stringify({
          success: true
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // If not found
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Change request not found'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error marking change request as reviewed: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// NEW PROJECT SUBMISSIONS
// ============================================

// Get or create the Event Proposal Submissions sheet
function getNewProjectSubmissionsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let submissionsSheet = spreadsheet.getSheetByName('Event Proposal Submissions');
  
  if (!submissionsSheet) {
    // Create the sheet if it doesn't exist
    submissionsSheet = spreadsheet.insertSheet('Event Proposal Submissions');
    
    // Set up headers to match the actual sheet structure
    const headers = [
      'ID',
      'Timestamp',
      'Company',
      'Venue Name',
      'Venue Address',
      'Load-In Date',
      'Load-In Time',
      'Load-Out Date',
      'Load-Out Time',
      'Products (JSON)',
      'Notes',
      'Resource Links',
      'Uploaded Files',
      'Schedule Call',
      'Submission Data'
    ];
    submissionsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    submissionsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    submissionsSheet.setFrozenRows(1);
  }
  
  return submissionsSheet;
}

// Save a new project submission
function saveNewProjectSubmission(payload) {
  try {
    Logger.log('Saving new project submission');
    Logger.log('Venue: ' + (payload.venueName || 'N/A'));
    Logger.log('Client Name from payload: ' + (payload.clientName || 'MISSING'));
    Logger.log('Payload keys: ' + Object.keys(payload).join(', '));
    
    const sheet = getNewProjectSubmissionsSheet();
    const timestamp = new Date();
    const id = timestamp.getTime().toString() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Extract company name - prioritize clientCompanyName from portal session
    const companyName = payload.clientCompanyName || payload.companyName || payload.clientName || '';
    Logger.log('Extracted company name: ' + companyName);
    
    // Store the full submission data as JSON
    const submissionData = JSON.stringify({
      type: payload.type,
      clientCompanyName: companyName,
      venueName: payload.venueName,
      venueAddress: payload.venueAddress,
      loadInDate: payload.loadInDate,
      loadInTime: payload.loadInTime,
      loadOutDate: payload.loadOutDate,
      loadOutTime: payload.loadOutTime,
      products: payload.products || [],
      notes: payload.notes || '',
      resourceLinks: payload.resourceLinks || '',
      uploadedFiles: payload.uploadedFiles || [],
      scheduleCall: payload.scheduleCall || false
    });
    
    // Format products as readable string for display
    const productsArray = payload.products || [];
    const productsJson = JSON.stringify(productsArray);
    
    // Map to correct columns: ID, Timestamp, Company, Venue Name, Venue Address, Load-In Date, Load-In Time, Load-Out Date, Load-Out Time, Products (JSON), Notes, Resource Links, Uploaded Files, Schedule Call, Submission Data
    const newRow = [
      id,                                    // A: ID
      timestamp,                             // B: Timestamp
      companyName,                           // C: Company (from portal session)
      payload.venueName || '',               // D: Venue Name
      payload.venueAddress || '',            // E: Venue Address
      payload.loadInDate || '',              // F: Load-In Date
      payload.loadInTime || '',              // G: Load-In Time
      payload.loadOutDate || '',             // H: Load-Out Date
      payload.loadOutTime || '',             // I: Load-Out Time
      productsJson,                          // J: Products (JSON)
      payload.notes || '',                   // K: Notes
      payload.resourceLinks || '',           // L: Resource Links
      (payload.uploadedFiles || []).length,  // M: Uploaded Files (count)
      payload.scheduleCall || false,         // N: Schedule Call
      submissionData                         // O: Submission Data
    ];
    
    sheet.appendRow(newRow);
    Logger.log('New project submission saved with ID: ' + id);
    
    // Send Slack notification
    try {
      Logger.log('Preparing Slack notification for new project submission...');
      const slackMessage = formatNewProjectSubmissionForSlack(payload);
      Logger.log('Slack message formatted, length: ' + slackMessage.length);
      sendSlackNotification(slackMessage);
      Logger.log('Slack notification call completed');
    } catch (slackError) {
      Logger.log('Error in Slack notification process: ' + slackError.toString());
      Logger.log('Slack error stack: ' + slackError.stack);
      // Continue even if Slack fails
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      submissionId: id
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error saving new project submission: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Get all new project submissions
function getNewProjectSubmissions() {
  try {
    Logger.log('=== getNewProjectSubmissions called ===');
    const sheet = getNewProjectSubmissionsSheet();
    Logger.log('Sheet name: ' + sheet.getName());
    
    const data = sheet.getDataRange().getValues();
    Logger.log('Total rows in sheet (including header): ' + data.length);
    
    if (data.length <= 1) {
      // Only headers, no data
      Logger.log('No data rows found - only headers');
      return ContentService.createTextOutput(JSON.stringify({
        submissions: [],
        _debug: {
          message: 'No data rows found',
          totalRows: 0,
          sheetName: sheet.getName()
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const submissions = [];
    
    // Skip header row
    const headers = data[0] || [];
    Logger.log('=== DEBUGGING: Headers ===');
    Logger.log('Headers found: ' + headers.join(' | '));
    Logger.log('Number of headers: ' + headers.length);
    for (let h = 0; h < headers.length; h++) {
      Logger.log('  Column ' + h + ': "' + (headers[h] || 'EMPTY') + '"');
    }
    
    // Check if Client Name column exists by looking at header row
    const hasClientNameColumn = headers.length > 2 && headers[2] === 'Client Name';
    Logger.log('Has Client Name column: ' + hasClientNameColumn);
    Logger.log('==========================================');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = row[0];
      const timestamp = row[1];
      
      Logger.log('');
      Logger.log('=== DEBUGGING: Row ' + i + ' ===');
      Logger.log('Row length: ' + row.length);
      Logger.log('ID: ' + id);
      Logger.log('Timestamp: ' + timestamp);
      
      // Log ALL column values
      Logger.log('--- All Column Values ---');
      for (let c = 0; c < Math.min(row.length, 16); c++) {
        const colValue = row[c];
        const colType = colValue instanceof Date ? 'Date' : typeof colValue;
        const displayValue = colValue instanceof Date ? colValue.toISOString() : String(colValue || 'EMPTY');
        Logger.log('  Column ' + c + ' (' + (headers[c] || 'NO HEADER') + '): [' + colType + '] "' + displayValue.substring(0, 100) + '"');
      }
      
      // Always try to get submissionData JSON first (most reliable)
      let submissionData = {};
      let submissionDataStr = '';
      
      // Find submissionData column - it should be the last column
      Logger.log('--- Looking for submissionData JSON ---');
      if (hasClientNameColumn && row.length > 14) {
        submissionDataStr = row[14] || '';
        Logger.log('Found submissionData at column 14 (hasClientNameColumn=true, row.length=' + row.length + ')');
      } else if (row.length > 13) {
        submissionDataStr = row[13] || '';
        Logger.log('Found submissionData at column 13 (no Client Name column, row.length=' + row.length + ')');
      } else {
        Logger.log('No submissionData column found (row.length=' + row.length + ')');
      }
      
      Logger.log('submissionDataStr length: ' + (submissionDataStr ? submissionDataStr.length : 0));
      if (submissionDataStr) {
        Logger.log('submissionDataStr preview: ' + submissionDataStr.substring(0, 200));
      }
      
      try {
        // Parse submissionData JSON first - this is the source of truth
        Logger.log('--- Parsing submissionData JSON ---');
        if (submissionDataStr) {
          try {
            submissionData = JSON.parse(submissionDataStr);
            Logger.log('✓ Parsed submissionData JSON successfully');
            Logger.log('submissionData keys: ' + Object.keys(submissionData).join(', '));
            Logger.log('  clientName: "' + (submissionData.clientName || 'MISSING') + '"');
            Logger.log('  venueName: "' + (submissionData.venueName || 'MISSING') + '"');
            Logger.log('  venueAddress: "' + (submissionData.venueAddress || 'MISSING') + '"');
            Logger.log('  loadInDate: "' + (submissionData.loadInDate || 'MISSING') + '"');
            Logger.log('  loadOutDate: "' + (submissionData.loadOutDate || 'MISSING') + '"');
            Logger.log('  scheduleCall: ' + (submissionData.scheduleCall || false));
          } catch (e) {
            Logger.log('✗ Error parsing submissionData JSON: ' + e.toString());
            Logger.log('Error details: ' + e.stack);
            submissionData = {};
          }
        } else {
          Logger.log('✗ No submissionData JSON string found');
          submissionData = {};
        }
        
        // ALWAYS use submissionData JSON as PRIMARY source if it exists and has data
        // Only fall back to column data if submissionData is empty or missing critical fields
        let clientName = '';
        let venueName = '';
        let venueAddress = '';
        let loadInDate = '';
        let loadInTime = '';
        let loadOutDate = '';
        let loadOutTime = '';
        let productsJson = '';
        let notes = '';
        let resourceLinks = '';
        let uploadedFilesCount = 0;
        let scheduleCall = false;
        
        // Check if submissionData has valid data
        const hasValidSubmissionData = submissionData && 
          (submissionData.clientName || submissionData.venueName || submissionData.venueAddress);
        
        Logger.log('--- Data Source Decision ---');
        Logger.log('hasValidSubmissionData: ' + hasValidSubmissionData);
        Logger.log('submissionData exists: ' + (submissionData && Object.keys(submissionData).length > 0));
        
        if (hasValidSubmissionData) {
          // Use submissionData JSON as source of truth
          Logger.log('✓ USING submissionData JSON for all fields');
          clientName = submissionData.clientName || '';
          venueName = submissionData.venueName || '';
          venueAddress = submissionData.venueAddress || '';
          loadInDate = submissionData.loadInDate || '';
          loadInTime = submissionData.loadInTime || '';
          loadOutDate = submissionData.loadOutDate || '';
          loadOutTime = submissionData.loadOutTime || '';
          notes = submissionData.notes || '';
          resourceLinks = submissionData.resourceLinks || '';
          uploadedFilesCount = submissionData.uploadedFiles ? submissionData.uploadedFiles.length : 0;
          scheduleCall = submissionData.scheduleCall || false;
          
          // Still need productsJson from columns (it's not in submissionData)
          Logger.log('Reading productsJson from columns...');
          if (hasClientNameColumn && row.length > 14) {
            productsJson = row[9] || '';
            Logger.log('  productsJson from column 9: "' + (productsJson.substring(0, 100) || 'EMPTY') + '"');
          } else {
            productsJson = row[8] || '';
            Logger.log('  productsJson from column 8: "' + (productsJson.substring(0, 100) || 'EMPTY') + '"');
          }
        } else {
          // Fall back to reading from columns
          Logger.log('✗ FALLING BACK to column data');
          Logger.log('hasClientNameColumn: ' + hasClientNameColumn);
          Logger.log('row.length: ' + row.length);
          
          if (hasClientNameColumn && row.length > 14) {
            Logger.log('Using NEW format (with Client Name column)');
            // New format with Client Name column (column index 2)
            clientName = row[2] || '';
            venueName = row[3] || '';
            venueAddress = row[4] || '';
            loadInDate = row[5] || '';
            loadInTime = row[6] || '';
            loadOutDate = row[7] || '';
            loadOutTime = row[8] || '';
            productsJson = row[9] || '';
            notes = row[10] || '';
            resourceLinks = row[11] || '';
            uploadedFilesCount = row[12] || 0;
            scheduleCall = row[13] || false;
            
            Logger.log('  Column 2 (Client Name): "' + clientName + '"');
            Logger.log('  Column 3 (Venue Name): "' + venueName + '"');
            Logger.log('  Column 4 (Venue Address): "' + venueAddress + '"');
            Logger.log('  Column 5 (Load-In Date): "' + loadInDate + '"');
            Logger.log('  Column 13 (Schedule Call): ' + scheduleCall);
          } else {
            Logger.log('Using OLD format (without Client Name column)');
            // Old format without Client Name column
            clientName = '';
            venueName = row[2] || '';
            venueAddress = row[3] || '';
            loadInDate = row[4] || '';
            loadInTime = row[5] || '';
            loadOutDate = row[6] || '';
            loadOutTime = row[7] || '';
            productsJson = row[8] || '';
            notes = row[9] || '';
            resourceLinks = row[10] || '';
            uploadedFilesCount = row[11] || 0;
            scheduleCall = row[12] || false;
            
            Logger.log('  Column 2 (Venue Name): "' + venueName + '"');
            Logger.log('  Column 3 (Venue Address): "' + venueAddress + '"');
            Logger.log('  Column 4 (Load-In Date): "' + loadInDate + '"');
            Logger.log('  Column 12 (Schedule Call): ' + scheduleCall);
          }
        }
        
        Logger.log('--- FINAL VALUES FOR ROW ' + i + ' ---');
        Logger.log('  clientName: "' + clientName + '"');
        Logger.log('  venueName: "' + venueName + '"');
        Logger.log('  venueAddress: "' + venueAddress + '"');
        Logger.log('  loadInDate: "' + loadInDate + '"');
        Logger.log('  loadOutDate: "' + loadOutDate + '"');
        Logger.log('  scheduleCall: ' + scheduleCall);
        Logger.log('==========================================');
        
        // Format dates properly - handle both Date objects and strings
        let formattedLoadInDate = '';
        if (loadInDate) {
          if (loadInDate instanceof Date) {
            formattedLoadInDate = formatDateForInput(loadInDate);
          } else {
            formattedLoadInDate = String(loadInDate).trim();
          }
        } else if (submissionData.loadInDate) {
          formattedLoadInDate = String(submissionData.loadInDate).trim();
        }
        
        let formattedLoadOutDate = '';
        if (loadOutDate) {
          if (loadOutDate instanceof Date) {
            formattedLoadOutDate = formatDateForInput(loadOutDate);
          } else {
            formattedLoadOutDate = String(loadOutDate).trim();
          }
        } else if (submissionData.loadOutDate) {
          formattedLoadOutDate = String(submissionData.loadOutDate).trim();
        }
        
        // Format times properly - handle serial numbers, Date objects, and strings
        let formattedLoadInTime = '';
        if (loadInTime !== null && loadInTime !== undefined && loadInTime !== '') {
          formattedLoadInTime = formatTimeFromSerial(loadInTime);
        } else if (submissionData.loadInTime) {
          formattedLoadInTime = String(submissionData.loadInTime).trim();
        }
        
        let formattedLoadOutTime = '';
        if (loadOutTime !== null && loadOutTime !== undefined && loadOutTime !== '') {
          formattedLoadOutTime = formatTimeFromSerial(loadOutTime);
        } else if (submissionData.loadOutTime) {
          formattedLoadOutTime = String(submissionData.loadOutTime).trim();
        }
        
        let products = [];
        if (productsJson) {
          try {
            products = JSON.parse(productsJson);
          } catch (e) {
            Logger.log('Error parsing products JSON: ' + e.toString());
          }
        }
        // Fallback to submissionData products if available
        if (products.length === 0 && submissionData.products && Array.isArray(submissionData.products)) {
          products = submissionData.products;
        }
        
        // Ensure notes and resourceLinks are separate
        const finalNotes = submissionData.notes || notes || '';
        const finalResourceLinks = submissionData.resourceLinks || resourceLinks || '';
        
        submissions.push({
          id: id,
          timestamp: timestamp ? (timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString()) : new Date().toISOString(),
          clientName: clientName,
          venueName: venueName,
          venueAddress: venueAddress,
          loadInDate: formattedLoadInDate,
          loadInTime: formattedLoadInTime,
          loadOutDate: formattedLoadOutDate,
          loadOutTime: formattedLoadOutTime,
          products: products,
          notes: finalNotes,
          resourceLinks: finalResourceLinks,
          uploadedFiles: submissionData.uploadedFiles || [],
          uploadedFilesCount: uploadedFilesCount || (submissionData.uploadedFiles ? submissionData.uploadedFiles.length : 0),
          scheduleCall: scheduleCall || (submissionData.scheduleCall || false),
          submissionData: submissionData
        });
      } catch (parseError) {
        Logger.log('ERROR parsing submission data for row ' + (i + 1) + ': ' + parseError.toString());
        Logger.log('Error stack: ' + parseError.stack);
        // Continue processing other rows even if one fails
        // Don't skip - try to add a basic entry with available data
        try {
          submissions.push({
            id: id || 'ERROR_' + i,
            timestamp: timestamp ? (timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString()) : new Date().toISOString(),
            clientName: row[2] || 'ERROR',
            venueName: row[3] || 'ERROR',
            venueAddress: row[4] || 'ERROR',
            loadInDate: '',
            loadInTime: '',
            loadOutDate: '',
            loadOutTime: '',
            products: [],
            notes: '',
            resourceLinks: '',
            uploadedFiles: [],
            uploadedFilesCount: 0,
            scheduleCall: false,
            _error: 'Failed to parse row: ' + parseError.toString()
          });
        } catch (fallbackError) {
          Logger.log('CRITICAL: Failed to add fallback entry for row ' + i + ': ' + fallbackError.toString());
        }
      }
    }
    
    Logger.log('=== FINAL SUMMARY ===');
    Logger.log('Total rows processed: ' + (data.length - 1));
    Logger.log('Submissions successfully parsed: ' + submissions.length);
    Logger.log('========================');
    
    // Include debug info in response (can be removed later)
    const debugInfo = {
      totalRows: data.length - 1,
      submissionsFound: submissions.length,
      headers: headers,
      hasClientNameColumn: hasClientNameColumn,
      sheetName: sheet.getName(),
      sampleRow: data.length > 1 ? {
        rowLength: data[1].length,
        columnValues: data[1].slice(0, 16).map((val, idx) => ({
          index: idx,
          header: headers[idx] || 'NO HEADER',
          value: val instanceof Date ? val.toISOString() : String(val || '').substring(0, 50),
          type: val instanceof Date ? 'Date' : typeof val
        }))
      } : null
    };
    
    return ContentService.createTextOutput(JSON.stringify({
      submissions: submissions,
      _debug: debugInfo  // Remove this line later for production
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error getting new project submissions: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString(),
      submissions: []
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Format new project submission details for Slack
function formatNewProjectSubmissionForSlack(payload) {
  try {
    Logger.log('Formatting new project submission for Slack');
    Logger.log('Payload keys: ' + Object.keys(payload).join(', '));
    
    const venueName = payload.venueName || 'N/A';
    const venueAddress = payload.venueAddress || 'N/A';
    const loadInDate = payload.loadInDate || 'N/A';
    const loadInTime = payload.loadInTime || '';
    const loadOutDate = payload.loadOutDate || 'N/A';
    const loadOutTime = payload.loadOutTime || '';
    const scheduleCall = payload.scheduleCall ? 'Yes' : 'No';
    
    let message = `🎯 *New Project Inquiry Submitted*\n\n`;
    message += `*Venue:* ${venueName}\n`;
    message += `*Address:* ${venueAddress}\n\n`;
    
    message += `*Timing:*\n`;
    message += `  • Load-In: ${loadInDate}${loadInTime ? ' at ' + loadInTime : ''}\n`;
    message += `  • Load-Out: ${loadOutDate}${loadOutTime ? ' at ' + loadOutTime : ''}\n\n`;
    
    // Products
    const products = payload.products || [];
    if (products.length > 0) {
      message += `*Requested Products:*\n`;
      products.forEach(product => {
        message += `  • ${product.name || 'Unnamed'} (Qty: ${product.quantity || 1})\n`;
      });
      message += `\n`;
    } else {
      message += `*Products:* None specified\n\n`;
    }
    
    // Resources
    const uploadedFiles = payload.uploadedFiles || [];
    const resourceLinks = payload.resourceLinks || '';
    if (uploadedFiles.length > 0 || resourceLinks.trim()) {
      message += `*Resources:*\n`;
      if (uploadedFiles.length > 0) {
        message += `  • ${uploadedFiles.length} file(s) uploaded\n`;
      }
      if (resourceLinks.trim()) {
        const links = resourceLinks.split('\n').filter(link => link.trim());
        links.forEach(link => {
          message += `  • ${link.trim()}\n`;
        });
      }
      message += `\n`;
    }
    
    // Notes
    if (payload.notes && payload.notes.trim()) {
      const notesPreview = payload.notes.length > 200 
        ? payload.notes.substring(0, 200) + '...' 
        : payload.notes;
      message += `*Notes:*\n${notesPreview}\n\n`;
    }
    
    message += `*Schedule Call Requested:* ${scheduleCall}\n\n`;
    message += `_Review in the proposals dashboard_`;
    
    Logger.log('Formatted Slack message length: ' + message.length);
    return message;
    
  } catch (error) {
    Logger.log('Error formatting new project submission for Slack: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    // Return a basic message if formatting fails
    return `🎯 *New Project Inquiry Submitted*\n\n*Venue:* ${payload.venueName || 'N/A'}\n*Address:* ${payload.venueAddress || 'N/A'}\n\n_Review in the proposals dashboard_`;
  }
}

// ============================================
// PROPOSAL APPROVAL
// ============================================

// Approve a proposal
function approveProposal(payload) {
  try {
    Logger.log('Approving proposal: ' + payload.projectNumber);
    Logger.log('Payload: ' + JSON.stringify(payload));
    
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // Find the proposal row
    const projectNumber = String(payload.projectNumber || '').trim();
    const version = String(payload.version || '').trim();
    
    Logger.log('Looking for projectNumber: "' + projectNumber + '", version: "' + version + '"');
    
    // Find matching row
    // Column 0: clientName (with version like "Client Name (V1)")
    // Column 15: status
    // Column 16: projectNumber
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      const rowProjectNumber = String(data[i][16] || '').trim();
      const rowClientName = String(data[i][0] || '').trim();
      
      // Parse version from clientName (format: "Client Name (V1)")
      const versionMatch = rowClientName.match(/\(V(\d+)\)$/);
      const rowVersion = versionMatch ? versionMatch[1] : '';
      
      Logger.log('Row ' + i + ': projectNumber="' + rowProjectNumber + '", version="' + rowVersion + '", clientName="' + rowClientName + '"');
      
      if (rowProjectNumber === projectNumber && rowVersion === version) {
        foundRow = i;
        Logger.log('Found matching proposal at row ' + (i + 1));
        break;
      }
    }
    
    if (foundRow === -1) {
      Logger.log('Proposal not found: projectNumber="' + projectNumber + '", version="' + version + '"');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Proposal not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Update status column (column 15, index 15) to "Approved"
    // Status is at index 15 (0-indexed), so column 16 (1-indexed)
    const statusColumn = 16; // Column Q (1-indexed)
    sheet.getRange(foundRow + 1, statusColumn).setValue('Approved');
    Logger.log('Updated status to "Approved" in row ' + (foundRow + 1) + ', column ' + statusColumn);
    
    // Get proposal data for Slack notification
    const proposalData = {
      clientName: String(data[foundRow][0] || '').trim(),
      projectNumber: projectNumber,
      version: version,
      venueName: String(data[foundRow][2] || '').trim(),
      startDate: data[foundRow][3] || '',
      total: data[foundRow][14] || ''
    };
    
    // Only send Slack notification for client-initiated approvals (not internal team confirmations)
    // If isClientInitiated is explicitly false, skip notification. Otherwise, assume client-initiated.
    const isClientInitiated = payload.isClientInitiated !== false;
    
    if (isClientInitiated) {
      // Send Slack notification
      try {
        const slackMessage = formatApprovalForSlack({
          ...payload,
          ...proposalData
        });
        sendSlackNotification(slackMessage);
        Logger.log('Slack notification sent successfully (client-initiated approval)');
      } catch (slackError) {
        Logger.log('Error sending Slack notification: ' + slackError.toString());
        // Continue even if Slack fails
      }
    } else {
      Logger.log('Skipping Slack notification (internal team confirmation)');
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Proposal approved successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error approving proposal: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Error approving proposal: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// SLACK NOTIFICATIONS
// ============================================

// Send a Slack notification via webhook
function sendSlackNotification(message) {
  Logger.log('========================================');
  Logger.log('sendSlackNotification called');
  Logger.log('========================================');
  Logger.log('SLACK_WEBHOOK_URL is: ' + (SLACK_WEBHOOK_URL ? 'SET (' + SLACK_WEBHOOK_URL.length + ' chars)' : 'EMPTY'));
  
  if (!SLACK_WEBHOOK_URL || SLACK_WEBHOOK_URL.trim() === '') {
    Logger.log('❌ ERROR: Slack webhook URL not configured, skipping notification');
    Logger.log('   Please set SLACK_WEBHOOK_URL constant at the top of this file');
    return false;
  }
  
  // Validate message
  if (!message || typeof message !== 'string') {
    Logger.log('❌ ERROR: Invalid message provided');
    Logger.log('   Message type: ' + typeof message);
    Logger.log('   Message value: ' + message);
    return false;
  }
  
  try {
    const payload = {
      text: message
    };
    
    Logger.log('Preparing to send Slack notification...');
    Logger.log('Webhook URL: ' + SLACK_WEBHOOK_URL);
    Logger.log('Message length: ' + message.length + ' characters');
    Logger.log('Message preview (first 200 chars): ' + message.substring(0, 200));
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    Logger.log('Making HTTP request...');
    Logger.log('Request options: ' + JSON.stringify({
      method: options.method,
      contentType: options.contentType,
      payloadLength: options.payload.length
    }));
    
    const startTime = new Date().getTime();
    const response = UrlFetchApp.fetch(SLACK_WEBHOOK_URL, options);
    const endTime = new Date().getTime();
    const duration = endTime - startTime;
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const responseHeaders = response.getHeaders();
    
    Logger.log('HTTP request completed in ' + duration + 'ms');
    Logger.log('Response Code: ' + responseCode);
    Logger.log('Response Headers: ' + JSON.stringify(responseHeaders));
    Logger.log('Response Text: ' + responseText);
    
    if (responseCode === 200) {
      Logger.log('✅ SUCCESS: Slack notification sent successfully');
      Logger.log('   Check your Slack channel for the message');
      return true;
    } else if (responseCode === 404) {
      Logger.log('❌ ERROR: Webhook URL not found (404)');
      Logger.log('   The webhook URL may be invalid or expired');
      Logger.log('   Please verify the URL in your Slack app settings');
      Logger.log('   Current URL: ' + SLACK_WEBHOOK_URL);
      return false;
    } else if (responseCode === 403) {
      Logger.log('❌ ERROR: Access forbidden (403)');
      Logger.log('   The webhook may have been revoked or disabled');
      Logger.log('   Please check your Slack app settings');
      return false;
    } else if (responseCode === 400) {
      Logger.log('❌ ERROR: Bad request (400)');
      Logger.log('   The payload format may be incorrect');
      Logger.log('   Response: ' + responseText);
      Logger.log('   Payload sent: ' + JSON.stringify(payload).substring(0, 200));
      return false;
    } else {
      Logger.log('❌ ERROR: Unexpected response code: ' + responseCode);
      Logger.log('   Response: ' + responseText);
      return false;
    }
  } catch (error) {
    Logger.log('❌ EXCEPTION: Error sending Slack notification');
    Logger.log('   Error type: ' + typeof error);
    Logger.log('   Error message: ' + error.toString());
    Logger.log('   Error name: ' + (error.name || 'N/A'));
    Logger.log('   Error stack: ' + (error.stack || 'No stack trace available'));
    
    // Try to get more details about the error
    if (error.message) {
      Logger.log('   Error message detail: ' + error.message);
    }
    if (error.toString) {
      Logger.log('   Error toString: ' + error.toString());
    }
    
    // Don't throw error - Slack notification failure shouldn't break the main flow
    return false;
  } finally {
    Logger.log('========================================');
  }
}

// Format change request details for Slack
function formatChangeRequestForSlack(payload) {
  try {
    Logger.log('Formatting change request for Slack');
    Logger.log('Payload keys: ' + Object.keys(payload).join(', '));
    
    const clientName = payload.originalProposal?.clientName || 'Unknown Client';
    const projectNumber = payload.projectNumber || 'N/A';
    const version = payload.version || 'N/A';
    const venue = payload.originalProposal?.venueName || 'N/A';
    
    Logger.log('Client: ' + clientName + ', Project: ' + projectNumber + ', Version: ' + version);
    
    let message = `🔔 *New Change Request Submitted*\n\n`;
    message += `*Client:* ${clientName}\n`;
    message += `*Project #:* ${projectNumber}\n`;
    message += `*Version:* ${version}\n`;
    message += `*Venue:* ${venue}\n\n`;
  
  const changes = payload.changes || {};
  
  // Date/Time changes
  if (changes.dateTimeChanges) {
    const dt = changes.dateTimeChanges;
    if (dt.startDate || dt.endDate || dt.deliveryTime || dt.strikeTime) {
      message += `*Date/Time Changes:*\n`;
      if (dt.startDate) message += `  • Start Date: ${dt.startDate}\n`;
      if (dt.endDate) message += `  • End Date: ${dt.endDate}\n`;
      if (dt.deliveryTime) message += `  • Load-In Time: ${dt.deliveryTime}\n`;
      if (dt.strikeTime) message += `  • Strike Time: ${dt.strikeTime}\n`;
      message += `\n`;
    }
  }
  
  // Quantity changes
  const quantityChanges = changes.quantityChanges || {};
  if (Object.keys(quantityChanges).length > 0) {
    message += `*Quantity Changes:*\n`;
    Object.values(quantityChanges).forEach(qChange => {
      message += `  • ${qChange.productName}: ${qChange.originalQuantity} → ${qChange.newQuantity}\n`;
    });
    message += `\n`;
  }
  
  // New products
  if (changes.newProducts && changes.newProducts.length > 0) {
    message += `*New Products Requested:*\n`;
    changes.newProducts.forEach(prod => {
      message += `  • ${prod.name} (Qty: ${prod.quantity}) - Section: ${prod.section}\n`;
      if (prod.notes) message += `    Notes: ${prod.notes}\n`;
    });
    message += `\n`;
  }
  
  // Misc notes
  if (changes.miscNotes && changes.miscNotes.trim()) {
    message += `*Additional Notes:*\n${changes.miscNotes}\n\n`;
  }
  
  message += `_Review in the proposals dashboard_`;
  
  Logger.log('Formatted Slack message length: ' + message.length);
  return message;
  
  } catch (error) {
    Logger.log('Error formatting change request for Slack: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    // Return a basic message if formatting fails
    return `🔔 *New Change Request Submitted*\n\n*Client:* ${payload.originalProposal?.clientName || 'Unknown'}\n*Project #:* ${payload.projectNumber || 'N/A'}\n*Version:* ${payload.version || 'N/A'}\n\n_Review in the proposals dashboard_`;
  }
}

// Format proposal approval for Slack
function formatApprovalForSlack(payload) {
  const clientName = payload.clientName || 'Unknown Client';
  const projectNumber = payload.projectNumber || 'N/A';
  const version = payload.version || 'N/A';
  const venue = payload.venueName || 'N/A';
  const eventDate = payload.eventDate || payload.startDate || 'N/A';
  const total = payload.total ? '$' + parseFloat(payload.total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A';
  
  let message = `✅ *Proposal Approved*\n\n`;
  message += `*Client:* ${clientName}\n`;
  message += `*Project #:* ${projectNumber}\n`;
  message += `*Version:* ${version}\n`;
  message += `*Venue:* ${venue}\n`;
  message += `*Event Date:* ${eventDate}\n`;
  message += `*Total:* ${total}\n\n`;
  message += `_Proposal has been approved by the client_`;
  
  return message;
}

// ============================================
// TEST FUNCTIONS
// ============================================

// ============================================
// COMPREHENSIVE SLACK DIAGNOSTIC TEST
// Run this function to diagnose Slack notification issues
// ============================================
function testSlackDiagnostics() {
  Logger.log('========================================');
  Logger.log('SLACK NOTIFICATION DIAGNOSTIC TEST');
  Logger.log('========================================');
  Logger.log('');
  
  // Test 1: Check webhook URL configuration
  Logger.log('TEST 1: Checking webhook URL configuration...');
  if (!SLACK_WEBHOOK_URL) {
    Logger.log('❌ FAILED: SLACK_WEBHOOK_URL is not defined');
    return;
  }
  
  if (SLACK_WEBHOOK_URL.trim() === '') {
    Logger.log('❌ FAILED: SLACK_WEBHOOK_URL is empty');
    return;
  }
  
  Logger.log('✅ PASSED: Webhook URL is configured');
  Logger.log('   URL length: ' + SLACK_WEBHOOK_URL.length + ' characters');
  Logger.log('   URL starts with: ' + SLACK_WEBHOOK_URL.substring(0, 30) + '...');
  Logger.log('');
  
  // Test 2: Validate webhook URL format
  Logger.log('TEST 2: Validating webhook URL format...');
  if (!SLACK_WEBHOOK_URL.startsWith('https://hooks.slack.com/services/')) {
    Logger.log('⚠️  WARNING: Webhook URL does not start with expected prefix');
    Logger.log('   Expected: https://hooks.slack.com/services/');
    Logger.log('   Actual: ' + SLACK_WEBHOOK_URL.substring(0, 40));
  } else {
    Logger.log('✅ PASSED: Webhook URL format looks correct');
  }
  Logger.log('');
  
  // Test 3: Test simple message
  Logger.log('TEST 3: Testing simple message delivery...');
  try {
    const simpleMessage = '🧪 *Test Slack Notification*\n\nThis is a test message from Google Apps Script. If you receive this, your Slack webhook is configured correctly!';
    
    const payload = {
      text: simpleMessage
    };
    
    Logger.log('Sending test message...');
    Logger.log('Message length: ' + simpleMessage.length + ' characters');
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    Logger.log('Making HTTP request to: ' + SLACK_WEBHOOK_URL);
    const response = UrlFetchApp.fetch(SLACK_WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('Response Code: ' + responseCode);
    Logger.log('Response Text: ' + responseText);
    
    if (responseCode === 200) {
      Logger.log('✅ SUCCESS: Message sent successfully!');
      Logger.log('   Check your Slack channel for the test message.');
    } else if (responseCode === 404) {
      Logger.log('❌ FAILED: Webhook URL not found (404)');
      Logger.log('   The webhook URL may be invalid or expired.');
      Logger.log('   Please verify the URL in your Slack app settings.');
    } else if (responseCode === 403) {
      Logger.log('❌ FAILED: Access forbidden (403)');
      Logger.log('   The webhook may have been revoked or disabled.');
      Logger.log('   Please check your Slack app settings.');
    } else {
      Logger.log('❌ FAILED: Unexpected response code: ' + responseCode);
      Logger.log('   Response: ' + responseText);
    }
  } catch (error) {
    Logger.log('❌ ERROR: Exception occurred during test');
    Logger.log('   Error: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'No stack trace'));
  }
  Logger.log('');
  
  // Test 4: Test change request formatting
  Logger.log('TEST 4: Testing change request message formatting...');
  try {
    const testPayload = {
      type: 'changeRequest',
      projectNumber: 'TEST-001',
      version: '1',
      timestamp: new Date().toISOString(),
      changes: {
        quantityChanges: {
          '0-0': {
            sectionIdx: 0,
            productIdx: 0,
            originalQuantity: 5,
            newQuantity: 10,
            productName: 'Test Product'
          }
        },
        dateTimeChanges: {
          startDate: '2026-01-15',
          endDate: '2026-01-17'
        }
      },
      originalProposal: {
        projectNumber: 'TEST-001',
        version: '1',
        clientName: 'Test Client',
        venueName: 'Test Venue'
      }
    };
    
    const formattedMessage = formatChangeRequestForSlack(testPayload);
    Logger.log('✅ PASSED: Change request message formatted successfully');
    Logger.log('   Formatted message length: ' + formattedMessage.length + ' characters');
    Logger.log('   Message preview (first 150 chars): ' + formattedMessage.substring(0, 150));
  } catch (error) {
    Logger.log('❌ FAILED: Error formatting change request message');
    Logger.log('   Error: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'No stack trace'));
  }
  Logger.log('');
  
  // Test 5: Test approval formatting
  Logger.log('TEST 5: Testing approval message formatting...');
  try {
    const testApprovalPayload = {
      clientName: 'Test Client',
      projectNumber: 'TEST-001',
      version: '1',
      venueName: 'Test Venue',
      eventDate: 'January 15, 2026',
      total: 5000.00
    };
    
    const formattedApproval = formatApprovalForSlack(testApprovalPayload);
    Logger.log('✅ PASSED: Approval message formatted successfully');
    Logger.log('   Formatted message length: ' + formattedApproval.length + ' characters');
    Logger.log('   Message preview (first 150 chars): ' + formattedApproval.substring(0, 150));
  } catch (error) {
    Logger.log('❌ FAILED: Error formatting approval message');
    Logger.log('   Error: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'No stack trace'));
  }
  Logger.log('');
  
  Logger.log('========================================');
  Logger.log('DIAGNOSTIC TEST COMPLETE');
  Logger.log('========================================');
  Logger.log('');
  Logger.log('Next steps:');
  Logger.log('1. Check the logs above for any ❌ failures');
  Logger.log('2. If Test 3 failed, verify your webhook URL in Slack');
  Logger.log('3. If Test 3 passed but notifications still fail, check the actual function calls');
  Logger.log('4. View > View > Execution log in Apps Script to see detailed logs');
}

// Test function to verify Slack webhook is working
// Run this function manually from the Apps Script editor to test Slack notifications
function testSlackNotification() {
  Logger.log('Testing Slack notification...');
  
  const testMessage = '🧪 *Test Slack Notification*\n\nThis is a test message from Google Apps Script. If you receive this, your Slack webhook is configured correctly!';
  
  sendSlackNotification(testMessage);
  
  Logger.log('Test notification sent. Check your Slack channel.');
  Logger.log('Check View > Execution log for detailed results.');
}

// Test function with sample change request data
function testChangeRequestSlack() {
  Logger.log('========================================');
  Logger.log('Testing change request Slack notification...');
  Logger.log('========================================');
  
  const testPayload = {
    type: 'changeRequest',
    projectNumber: 'TEST-001',
    version: '1',
    timestamp: new Date().toISOString(),
    changes: {
      quantityChanges: {
        '0-0': {
          sectionIdx: 0,
          productIdx: 0,
          originalQuantity: 5,
          newQuantity: 10,
          productName: 'Test Product'
        }
      },
      dateTimeChanges: {
        startDate: '2026-01-15',
        endDate: '2026-01-17',
        deliveryTime: '9:00 AM',
        strikeTime: '6:00 PM'
      },
      newProducts: [
        {
          name: 'New Test Product',
          quantity: 2,
          section: 'Test Section',
          notes: 'Test notes'
        }
      ],
      miscNotes: 'This is a test change request notification.'
    },
    originalProposal: {
      projectNumber: 'TEST-001',
      version: '1',
      clientName: 'Test Client',
      venueName: 'Test Venue'
    }
  };
  
  Logger.log('Test payload created');
  Logger.log('Calling formatChangeRequestForSlack...');
  
  try {
    const slackMessage = formatChangeRequestForSlack(testPayload);
    Logger.log('Message formatted successfully');
    Logger.log('Calling sendSlackNotification...');
    
    const result = sendSlackNotification(slackMessage);
    
    if (result) {
      Logger.log('✅ Test change request notification sent successfully!');
      Logger.log('   Check your Slack channel for the message.');
    } else {
      Logger.log('❌ Test change request notification failed');
      Logger.log('   Check the logs above for error details.');
    }
  } catch (error) {
    Logger.log('❌ ERROR: Exception during test');
    Logger.log('   Error: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'No stack trace'));
  }
  
  Logger.log('========================================');
}

// Test function for approval notification
function testApprovalSlack() {
  Logger.log('========================================');
  Logger.log('Testing approval Slack notification...');
  Logger.log('========================================');
  
  const testPayload = {
    type: 'approveProposal',
    projectNumber: 'TEST-002',
    version: '1',
    clientName: 'Test Client Company',
    venueName: 'Test Venue',
    eventDate: 'January 15, 2026',
    startDate: '2026-01-15',
    total: 5000.00,
    isClientInitiated: true
  };
  
  Logger.log('Test payload created');
  Logger.log('Calling formatApprovalForSlack...');
  
  try {
    const slackMessage = formatApprovalForSlack(testPayload);
    Logger.log('Message formatted successfully');
    Logger.log('Calling sendSlackNotification...');
    
    const result = sendSlackNotification(slackMessage);
    
    if (result) {
      Logger.log('✅ Test approval notification sent successfully!');
      Logger.log('   Check your Slack channel for the message.');
    } else {
      Logger.log('❌ Test approval notification failed');
      Logger.log('   Check the logs above for error details.');
    }
  } catch (error) {
    Logger.log('❌ ERROR: Exception during test');
    Logger.log('   Error: ' + error.toString());
    Logger.log('   Stack: ' + (error.stack || 'No stack trace'));
  }
  
  Logger.log('========================================');
}

// ============================================
// SETUP INSTRUCTIONS
// ============================================
//
// 1. Copy this entire file to your Google Apps Script Code.gs
//
// 2. Update the SHEET_ID and CATALOG_ID constants at the top if needed
//
// 3. Enable Drive API:
//    - In Apps Script editor, click on the Services icon (puzzle piece) on the left
//    - Click "+ Add a service"
//    - Search for "Drive API" and add it
//
// 4. Deploy as a web app:
//    - Click "Deploy" > "New deployment"
//    - Choose type: "Web app"
//    - Execute as: "Me"
//    - Who has access: "Anyone" (or your preference)
//    - Click "Deploy"
//    - Copy the web app URL and update it in your React code
//
// 5. Test the PDF upload:
//    - Create/edit a proposal with a client folder URL
//    - Save as a new version
//    - Check the Google Drive folder for the uploaded PDF
//
// PDF naming format:
// (V#) Client Name - Venue - Event Date - Mayker Events Rental Proposal
// Example: (V1) Small Saul - The Parthenon - November 1-2, 2026 - Mayker Events Rental Proposal

