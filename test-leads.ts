import { searchHvacCompanies } from "./src/lib/integrations/google-places";

async function test() {
  try {
    console.log("Testing lead discovery for Vancouver BC...");
    const results = await searchHvacCompanies({ area: "Vancouver BC", keyword: "HVAC contractor" });
    console.log(`Found ${results.length} results:`);
    results.slice(0, 3).forEach(r => {
      console.log(`- ${r.name}: ${r.website}`);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
