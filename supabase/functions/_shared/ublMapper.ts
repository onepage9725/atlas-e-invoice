export function mapToUBL21(invoiceData: any): any {
  // This is a simplified placeholder structure representing the required 51 fields
  // for a Malaysia LHDN standard E-Invoice in UBL 2.1 JSON format.
  
  const taxRate = invoiceData.tax_rate ?? 8;
  const invoiceLines = (invoiceData.line_items || []).map((line: any, index: number) => {
     const qty = line.qty || 1;
     const price = line.nett_price || 0;
     const includeSst = qty * price * ((line.commission_rate || 0) / 100);
     const excludeSst = includeSst / (1 + taxRate / 100);
     const sstAmount = includeSst - excludeSst;

     return {
        "ID": (index + 1).toString(),
        "InvoicedQuantity": {
          "@unitCode": "C62", // Default unit code
          "#text": qty
        },
        "LineExtensionAmount": {
          "@currencyID": "MYR",
          "#text": excludeSst.toFixed(2)
        },
        "TaxTotal": [{
          "TaxAmount": {
             "@currencyID": "MYR",
             "#text": sstAmount.toFixed(2)
          },
          "TaxSubtotal": [{
             "TaxableAmount": {
                "@currencyID": "MYR",
                "#text": excludeSst.toFixed(2)
             },
             "TaxAmount": {
                "@currencyID": "MYR",
                "#text": sstAmount.toFixed(2)
             },
             "TaxCategory": [{
                "ID": "01", // Standard Rate
                "Percent": taxRate.toString(),
                "TaxScheme": {
                   "ID": "OTH",
                   "SchemeAgencyID": "6"
                }
             }]
          }]
        }],
        "Item": {
           "Description": line.item_description || "Service",
           "ClassifiedTaxCategory": [{
              "ID": "01",
              "Percent": taxRate.toString(),
              "TaxScheme": {
                 "ID": "OTH",
                 "SchemeAgencyID": "6"
              }
           }]
        },
        "Price": {
           "PriceAmount": {
              "@currencyID": "MYR",
              "#text": price.toFixed(2)
           }
        }
     };
  });

  const totalExcludeSst = invoiceLines.reduce((acc: number, cur: any) => acc + parseFloat(cur.LineExtensionAmount["#text"]), 0);
  const totalSst = invoiceLines.reduce((acc: number, cur: any) => acc + parseFloat(cur.TaxTotal[0].TaxAmount["#text"]), 0);
  const grandTotal = totalExcludeSst + totalSst;

  return {
    "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "Invoice": [{
      "ID": invoiceData.invoice_number || "INV-0001",
      "IssueDate": invoiceData.invoice_date || new Date().toISOString().split("T")[0],
      "IssueTime": "12:00:00Z",
      "InvoiceTypeCode": {
         "@listVersionID": "1.0",
         "#text": "01" // 01 for standard invoice
      },
      "DocumentCurrencyCode": "MYR",
      "AccountingSupplierParty": {
         "Party": {
            "PartyIdentification": [{ "ID": { "@schemeID": "TIN", "#text": "IG1234567890" } }], // Supplier TIN Placeholder
            "PartyName": [{ "Name": "ATLAS OLSEN GROUP SDN. BHD." }],
            "PostalAddress": {
               "CityName": "Iskandar Puteri",
               "PostalZone": "79250",
               "CountrySubentityCode": "JHR",
               "Country": { "IdentificationCode": { "@listID": "ISO3166-1", "@listAgencyID": "6", "#text": "MYS" } }
            },
            "PartyLegalEntity": [{ "RegistrationName": "ATLAS OLSEN GROUP SDN. BHD." }]
         }
      },
      "AccountingCustomerParty": {
         "Party": {
            "PartyIdentification": [{ "ID": { "@schemeID": "TIN", "#text": "IG0987654321" } }], // Buyer TIN Placeholder
            "PartyName": [{ "Name": invoiceData.bill_to || "Customer Name" }],
            "PostalAddress": {
               "CityName": "Kuala Lumpur",
               "PostalZone": "50000",
               "CountrySubentityCode": "KUL",
               "Country": { "IdentificationCode": { "@listID": "ISO3166-1", "@listAgencyID": "6", "#text": "MYS" } }
            },
            "PartyLegalEntity": [{ "RegistrationName": invoiceData.bill_to || "Customer Name" }]
         }
      },
      "TaxTotal": [{
         "TaxAmount": {
            "@currencyID": "MYR",
            "#text": totalSst.toFixed(2)
         }
      }],
      "LegalMonetaryTotal": {
         "LineExtensionAmount": { "@currencyID": "MYR", "#text": totalExcludeSst.toFixed(2) },
         "TaxExclusiveAmount": { "@currencyID": "MYR", "#text": totalExcludeSst.toFixed(2) },
         "TaxInclusiveAmount": { "@currencyID": "MYR", "#text": grandTotal.toFixed(2) },
         "PayableAmount": { "@currencyID": "MYR", "#text": grandTotal.toFixed(2) }
      },
      "InvoiceLine": invoiceLines
    }]
  };
}
