/* Is the off-line speed penalty enough to hold a hairpin?

   Corner speed goes as sqrt(radius): v = sqrt(a_lat * R). A car displaced d
   metres toward the outside of a corner of radius R has to take radius R-d if
   it wants to end up in the same place, so the speed it can actually hold is
   sqrt((R-d)/R) of the line's. The penalty has to be at least that, or the car
   arrives able to do everything except get round. */
/* The rule as the page now computes it: straight out of the curvature. */
const offK = (off,R) => Math.sqrt(Math.max(0.5, 1-off*(1/R)));
console.log('La Source is about 25 m radius; the fastest corners here are 300 m.\n');
console.log('  off-line   needed at R=25   needed at R=80   penalty applied');
let fails=[];
for(const off of [0,1,1.5,2,3,4,5,6]){
  const need25=Math.sqrt(Math.max(0,(25-off))/25);
  const need80=Math.sqrt(Math.max(0,(80-off))/80);
  const got=offK(off,25);
  const ok=got<=need25+1e-9;
  console.log('   '+String(off).padStart(4)+' m       '+need25.toFixed(3)
    +'            '+need80.toFixed(3)+'            '+got.toFixed(3)
    +(ok?'   ok':'   NOT ENOUGH'));
  if(!ok && off>=2) fails.push(off+' m off-line: applies '+got.toFixed(3)
    +' but a 25 m corner needs '+need25.toFixed(3));
}
console.log(fails.length?'\nFAIL:\n  '+fails.join('\n  ')
 :'\nPASS - at every displacement the penalty is at least what the tightest\n'
 +'       corner on the circuit requires, and conservative on the fast ones');
process.exit(fails.length?1:0);
