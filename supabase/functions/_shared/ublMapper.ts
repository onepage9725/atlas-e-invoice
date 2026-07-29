export function mapToUBL21(invoiceData: any): any {
  const taxRate = invoiceData.tax_rate ?? 8;
  const invoiceLines = (invoiceData.line_items || []).map((line: any, index: number) => {
     const qty = line.qty || 1;
     const price = line.nett_price || 0;
     const includeSst = qty * price * ((line.commission_rate || 0) / 100);
     const excludeSst = includeSst / (1 + taxRate / 100);
     const sstAmount = includeSst - excludeSst;

     return {
        "ID": [{ "_": (index + 1).toString() }],
        "InvoicedQuantity": [{ "unitCode": "C62", "_": qty }],
        "LineExtensionAmount": [{ "currencyID": "MYR", "_": parseFloat(excludeSst.toFixed(2)) }],
        "ItemPriceExtension": [{ "Amount": [{ "currencyID": "MYR", "_": parseFloat(excludeSst.toFixed(2)) }] }],
        "Item": [{
           "Description": [{ "_": line.item_description || "Service" }],
           "CommodityClassification": [{
              "ItemClassificationCode": [{ "listID": "CLASS", "_": "022" }]
           }],
           "ClassifiedTaxCategory": [{
              "ID": [{ "_": "02" }],
              "Percent": [{ "_": taxRate }],
              "TaxScheme": [{
                 "ID": [{ "schemeID": "UN/ECE 5153", "schemeAgencyID": "6", "_": "OTH" }]
              }]
           }]
        }],
        "Price": [{
           "PriceAmount": [{ "currencyID": "MYR", "_": parseFloat(price.toFixed(2)) }]
        }],
        "TaxTotal": [{
          "TaxAmount": [{ "currencyID": "MYR", "_": parseFloat(sstAmount.toFixed(2)) }],
          "TaxSubtotal": [{
             "TaxableAmount": [{ "currencyID": "MYR", "_": parseFloat(excludeSst.toFixed(2)) }],
             "TaxAmount": [{ "currencyID": "MYR", "_": parseFloat(sstAmount.toFixed(2)) }],
             "TaxCategory": [{
                "ID": [{ "_": "02" }],
                "Percent": [{ "_": taxRate }],
                "TaxScheme": [{
                   "ID": [{ "schemeID": "UN/ECE 5153", "schemeAgencyID": "6", "_": "OTH" }]
                }]
             }]
          }]
        }]
     };
  });

  const totalExcludeSst = invoiceLines.reduce((acc: number, cur: any) => acc + cur.LineExtensionAmount[0]._, 0);
  const totalSst = invoiceLines.reduce((acc: number, cur: any) => acc + (cur.LineExtensionAmount[0]._ * (taxRate / 100)), 0);
  const grandTotal = totalExcludeSst + totalSst;

  return {
    "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "Invoice": [{
      "ID": [{ "_": invoiceData.invoice_number || `INV-${Date.now()}` }],
      "IssueDate": [{ "_": new Date().toISOString().split("T")[0] }],
      "IssueTime": [{ "_": new Date().toISOString().split("T")[1].replace(/\.\d+/, "") }],
      "InvoiceTypeCode": [{ "listVersionID": "1.0", "_": "01" }],
      "DocumentCurrencyCode": [{ "_": "MYR" }],
      "AccountingSupplierParty": [{
        "Party": [{
          "PartyIdentification": [
            { "ID": [{ "schemeID": "TIN", "_": "C26865763070" }] },
            { "ID": [{ "schemeID": "BRN", "_": "202101036790" }] }
          ],
          "IndustryClassificationCode": [{ "name": "Sale of motor vehicles", "_": "45105" }],
          "PartyName": [{ "Name": [{ "_": "ATLAS OLSEN GROUP SDN. BHD." }] }],
          "PostalAddress": [{
            "CityName": [{ "_": "JOHOR BAHRU" }],
            "PostalZone": [{ "_": "81100" }],
            "CountrySubentityCode": [{ "_": "01" }],
            "AddressLine": [{ "Line": [{ "_": "121-01 JALAN MUTIARA EMAS 2A, TAMAN MOUNT AUSTIN" }] }],
            "Country": [{ "IdentificationCode": [{ "listID": "ISO3166-1", "listAgencyID": "6", "_": "MYS" }] }]
          }],
          "PartyLegalEntity": [{ "RegistrationName": [{ "_": "ATLAS OLSEN GROUP SDN. BHD." }] }],
          "Contact": [{
            "Telephone": [{ "_": "+601111488678" }],
            "ElectronicMail": [{ "_": "eventure2000@gmail.com" }]
          }]
        }]
      }],
      "AccountingCustomerParty": [{
        "Party": [{
          "PartyIdentification": [
            { "ID": [{ "schemeID": "TIN", "_": "C26865763070" }] },
            { "ID": [{ "schemeID": "BRN", "_": "202101036790" }] }
          ],
          "PartyName": [{ "Name": [{ "_": invoiceData.bill_to || "Customer Name" }] }],
          "PostalAddress": [{
            "CityName": [{ "_": "NA" }],
            "PostalZone": [{ "_": "NA" }],
            "CountrySubentityCode": [{ "_": "01" }],
            "AddressLine": [{ "Line": [{ "_": "NA" }] }],
            "Country": [{ "IdentificationCode": [{ "listID": "ISO3166-1", "listAgencyID": "6", "_": "MYS" }] }]
          }],
          "PartyLegalEntity": [{ "RegistrationName": [{ "_": invoiceData.bill_to || "Customer Name" }] }],
          "Contact": [{
            "Telephone": [{ "_": "+601111488678" }],
            "ElectronicMail": [{ "_": "eventure2000@gmail.com" }]
          }]
        }]
      }],
      "TaxTotal": [{
        "TaxAmount": [{ "currencyID": "MYR", "_": parseFloat(totalSst.toFixed(2)) }],
        "TaxSubtotal": [{
           "TaxableAmount": [{ "currencyID": "MYR", "_": parseFloat(totalExcludeSst.toFixed(2)) }],
           "TaxAmount": [{ "currencyID": "MYR", "_": parseFloat(totalSst.toFixed(2)) }],
           "TaxCategory": [{
              "ID": [{ "_": "02" }],
              "Percent": [{ "_": taxRate }],
              "TaxScheme": [{
                 "ID": [{ "schemeID": "UN/ECE 5153", "schemeAgencyID": "6", "_": "OTH" }]
              }]
           }]
        }]
      }],
      "LegalMonetaryTotal": [{
        "LineExtensionAmount": [{ "currencyID": "MYR", "_": parseFloat(totalExcludeSst.toFixed(2)) }],
        "TaxExclusiveAmount": [{ "currencyID": "MYR", "_": parseFloat(totalExcludeSst.toFixed(2)) }],
        "TaxInclusiveAmount": [{ "currencyID": "MYR", "_": parseFloat(grandTotal.toFixed(2)) }],
        "PayableAmount": [{ "currencyID": "MYR", "_": parseFloat(grandTotal.toFixed(2)) }]
      }],
      "InvoiceLine": invoiceLines
    }]
  };
}