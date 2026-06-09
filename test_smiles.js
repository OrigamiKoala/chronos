import SmilesDrawer from 'smiles-drawer';

const smiles1 = '[Co+3].[NH3].[NH3].[NH3].[NH3].[NH3].[NH3]';
try {
  SmilesDrawer.parse(smiles1, () => {
    console.log("Parsed 1 successfully!");
  }, () => {
  });
} catch(err) {
  console.log("Error 1 catch:", err.message);
}
