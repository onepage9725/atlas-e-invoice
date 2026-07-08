import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "../assets/paymentvoucherlogo.png";

export type EInvoiceLineItem = {
  item_description: string;
  qty: number;
  nett_price: number;
  commission_rate: number;
};

export type EInvoiceRecord = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  bill_to: string;
  tax_rate: number;
  line_items: EInvoiceLineItem[] | null;
  created_at: string;
  updated_at: string;
  qr_code?: string; // Base64 string for LHDN validation
};

const formatAmount = (value: number) => {
  const rounded = Number(value.toFixed(2));
  return rounded.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const generateEInvoicePDF = async (record: EInvoiceRecord) => {
  const doc = new jsPDF("p", "pt", "a4");

  // Try to load the logo
  const img = new Image();
  img.src = logoUrl;
  
  let currentX = 40;
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    
    if (img.width > 0) {
      // Restrict height so it doesn't overlap text below
      const logoHeight = 45; 
      const logoWidth = (img.width * logoHeight) / img.height;
      doc.addImage(img, "PNG", 40, 20, logoWidth, logoHeight);
      currentX = 40 + logoWidth + 20;
    }
  } catch (err) {
    console.warn("Failed to load logo image for PDF", err);
    currentX = 40;
  }

  // Draw Header text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 34, 85); // Dark blue like in the image
  doc.text("ATLAS OLSEN GROUP SDN. BHD.", currentX, 40);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("202101036790 (1437090-T)", currentX, 55);

  doc.setLineWidth(1.5);
  doc.setDrawColor(17, 34, 85);
  doc.line(40, 75, 550, 75); // Header line

  // Address
  doc.setFontSize(10);
  let y = 100;
  const lineHeight = 15;
  doc.text("22-02, Laman Niaga Sunway,", 40, y); y += lineHeight;
  doc.text("Persiaran Medini 3,", 40, y); y += lineHeight;
  doc.text("Sunway City Iskandar Puteri,", 40, y); y += lineHeight;
  doc.text("79250 Iskandar Puteri, Johor Darul Takzim.", 40, y); y += lineHeight;

  y += 15;
  doc.setFont("helvetica", "bold");
  doc.text("SST Reg No. :", 40, y); y += lineHeight;
  doc.text("J31-2306-32000008", 40, y); y += lineHeight;

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.text("Email: atlasolsenrealtysdnbhd@gmail.com", 40, y); y += lineHeight;
  
  const currentY = y;
  doc.text("Contact: +6017-831 2209", 40, y); 
  doc.text(`Invoice: ${record.invoice_number}`, 550, currentY, { align: "right" });

  y += 35;
  doc.text("Bill to", 40, y); 
  doc.text(`Invoice Date: ${record.invoice_date}`, 550, y, { align: "right" });
  
  y += lineHeight;
  doc.setFont("helvetica", "bold");
  doc.text(record.bill_to.toUpperCase(), 40, y);
  
  // Table
  const tableData: any[][] = [];
  let subTotal = 0;
  let totalSst = 0;
  let grandTotal = 0;
  
  const taxRate = record.tax_rate ?? 8;

  if (record.line_items) {
    record.line_items.forEach((line, index) => {
      const includeSst = line.qty * line.nett_price * (line.commission_rate / 100);
      const excludeSst = includeSst / (1 + taxRate / 100);
      const sst = includeSst - excludeSst;

      subTotal += excludeSst;
      totalSst += sst;
      grandTotal += includeSst;

      tableData.push([
        index + 1,
        line.item_description,
        line.qty,
        `RM ${formatAmount(line.nett_price)}`,
        `${line.commission_rate}%`,
        `RM ${formatAmount(excludeSst)}`,
        `${taxRate}%`,
        `RM ${formatAmount(sst)}`,
        `RM ${formatAmount(includeSst)}`
      ]);
    });
  }

  y += 30;

  autoTable(doc, {
    startY: y,
    head: [["#", "Item & Description", "Qty", "Nett Price", "Commission Rate", "Total Exclude SST", "Tax Rate", "SST", "Total Include SST"]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: [24, 38, 93], // Dark blue
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },
    bodyStyles: {
      textColor: 0,
      lineColor: [220, 220, 220],
      lineWidth: 1,
      valign: 'middle'
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 25 },
      1: { cellWidth: 120 },
      2: { halign: 'center', cellWidth: 25 },
      3: { halign: 'right' },
      4: { halign: 'center', cellWidth: 50 },
      5: { halign: 'right' },
      6: { halign: 'center', cellWidth: 40 },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    styles: {
      fontSize: 8,
      cellPadding: 6,
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY || y;
  
  // Draw summary box
  const boxWidth = 200;
  const boxHeight = 90;
  const boxX = 350;
  const boxY = finalY + 20;

  doc.setFillColor(230, 230, 230);
  doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');
  
  doc.setFontSize(9);
  doc.text("MYR (RM)", boxX + boxWidth - 10, boxY + 18, { align: "right" });
  
  doc.setFont("helvetica", "bold");
  doc.text("Sub Total:", boxX + 15, boxY + 38);
  doc.setFont("helvetica", "normal");
  doc.text(`RM ${formatAmount(subTotal)}`, boxX + boxWidth - 10, boxY + 38, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text(`SST ${taxRate}%:`, boxX + 15, boxY + 58);
  doc.setFont("helvetica", "normal");
  doc.text(`RM ${formatAmount(totalSst)}`, boxX + boxWidth - 10, boxY + 58, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text("Total (Tax including)", boxX + 15, boxY + 78);
  doc.text(`RM ${formatAmount(grandTotal)}`, boxX + boxWidth - 10, boxY + 78, { align: "right" });

  // Notes
  let notesY = finalY + 40;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Notes", 40, notesY); notesY += 15;
  doc.text("Bank Account : 221-303-851-8", 40, notesY); notesY += 15;
  doc.text("Company Name : ATLAS OLSEN GROUP SDN. BHD.", 40, notesY); notesY += 15;
  doc.text("Company Bank : UOB BANK", 40, notesY);

  // If a QR code is present, draw it at the bottom left below notes
  if (record.qr_code) {
    try {
      doc.addImage(record.qr_code, "PNG", 40, notesY + 10, 80, 80);
      doc.setFontSize(8);
      doc.text("Scan for LHDN Validation", 40, notesY + 100);
    } catch (e) {
      console.warn("Failed to embed QR code", e);
    }
  }

  doc.save(`Invoice_${record.invoice_number.replace(/\//g, "-")}.pdf`);
};
