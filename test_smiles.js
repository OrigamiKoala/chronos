import SmilesDrawer from 'smiles-drawer';

const smiles1 = '[Co+3].[NH3].[NH3].[NH3].[NH3].[NH3].[NH3]';
try {
  SmilesDrawer.parse(smiles1, (tree) => {
  }, (err) => {
    console.log("Error 1 callback:", err.message);
  });
} catch(err) {
  console.log("Error 1 catch:", err.message);
}
