load("../life.js");
load("../formats.js");

load("gemini.js"); // defines gemini_rle

function assert(x, msg) 
{ 
    if(!x) 
        print("Assert failed: " + msg);
};


var 
    timer,
    life = new LifeUniverse(),
    pattern,
    bounds;


timer = Date.now();
pattern = formats.parse_pattern(gemini_rle);
print("parse_pattern " + (Date.now() - timer));

bounds = life.get_bounds(pattern.field);

assert(!pattern.error, pattern.error);


life.clear_pattern();

life.make_center(pattern.field, bounds);

timer = Date.now();
life.setup_field(pattern.field, bounds);
print("setup_field " + (Date.now() - timer));

timer = Date.now();

for(var i = 0; i < 5; i++)
    life.next_generation(true);

print("next_generation " + (Date.now() - timer));


life.set_step(8); // 256 generations at once

timer = Date.now();
life.next_generation(true);
print("next_generation quick " + (Date.now() - timer));
