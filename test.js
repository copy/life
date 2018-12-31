#!/usr/bin/env node
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const EXAMPLES_DIR = "examples";

vm.runInThisContext(fs.readFileSync("./formats.js"), { filename: "formats.js" });
vm.runInThisContext(fs.readFileSync("./macrocell.js"), { filename: "macrocell.js" });
vm.runInThisContext(fs.readFileSync("./life.js"), { filename: "life.js" });

const SLOW_PATTERNS = [
    "24cellquadraticgrowth.rle",
    "25cellquadraticgrowth.rle",
    "26cellquadraticgrowth.rle",
    "Heisenburp.rle",
    "P1-pseudo-Heisenburp.rle",
    "catacryst.rle",
    "caterpillar.rle",
    "demonoid_synth.rle",
    "gemini.rle",
    "metacatacryst.rle",
    "otcametapixel.rle",
    "otcametapixeloff.rle",
    "p1megacell.rle",
    "p59glidergun8kx8k.rle",
    "p59glidergunoriginal.rle",
    "p6108-c4-rake.rle",
    "period59gun.rle",
    "p448dartgun.rle",
    "pulsarpixeldisplay8x2.rle",
    "switchenginepingpong.rle",
    "universalturingmachine.rle",
    "utm.rle",
    "jaws.rle",
    "constructor-memory-loop.rle",
    "7-in-a-row-Cordership-V-gun.rle",
    "H-to-C.rle",
    "c4-sideways-rake.rle",
    "constructor-memory-tape.rle",
    "high-bandwidth-telegraph.rle",
    "slow-salvo-MWSS-oscillator.rle",
    "switch-engine-ping-pong.rle",
    "single-channel-spiral-growth.rle",
    "traffic-lights-extruder.rle",
];

const POPULATIONS_AFTER_PARSE = {
    // reported by Dave Greene: Uses non-'o' characters for alive cells
    "foureatershasslingfourbookends_synth.rle": 2074,
};

let files = fs.readdirSync(EXAMPLES_DIR);
files = files.filter(f => f.endsWith(".rle") || f.endsWith(".mc"));

for(let file of files)
{
    const is_mc = file.endsWith(".mc");

    const life = new LifeUniverse();
    const rle = fs.readFileSync(path.join(EXAMPLES_DIR, file)).toString("utf8");

    if(is_mc)
    {
        load_macrocell(life, rle);
        continue;
    }

    const pattern = formats.parse_pattern(rle);

    if(pattern.error)
    {
        console.error("While parsing %s: %s", file, pattern.error);
        continue;
    }

    const bounds = life.get_bounds(pattern.field_x, pattern.field_y);
    life.make_center(pattern.field_x, pattern.field_y, bounds);
    life.setup_field(pattern.field_x, pattern.field_y, bounds);

    if(pattern.rule_s && pattern.rule_b)
    {
        life.set_rules(pattern.rule_s, pattern.rule_b);
    }

    const expected_population = POPULATIONS_AFTER_PARSE[file];
    if(expected_population)
    {
        if(expected_population !== life.root.population)
        {
            console.error(`File ${file}: Expected population of ${expected_population}, got ${life.root.population}`);
            continue;
        }
    }

    if(SLOW_PATTERNS.includes(file))
    {
        continue;
    }

    const generated_rle = formats.generate_rle(life, undefined,
        ["test comment", "another test comment"]);
    const new_pattern = formats.parse_pattern(generated_rle);
    console.assert(!new_pattern.error);

    if(pattern.rule_s && pattern.rule_b)
    {
        console.assert(new_pattern.rule_s === pattern.rule_s);
        console.assert(new_pattern.rule_b === pattern.rule_b);
    }

    const new_life = new LifeUniverse();
    const new_bounds = new_life.get_bounds(new_pattern.field_x, new_pattern.field_y);
    new_life.clear_pattern();
    new_life.make_center(new_pattern.field_x, new_pattern.field_y, new_bounds);
    new_life.setup_field(new_pattern.field_x, new_pattern.field_y, new_bounds);

    console.assert(new_bounds.left === bounds.left);
    console.assert(new_bounds.top === bounds.top);
    console.assert(new_bounds.right === bounds.right);
    console.assert(new_bounds.bottom === bounds.bottom);

    // may fail if the original rle file doesn't correctly specify the bounds
    // of the pattern
    //console.assert(pattern.width === new_pattern.width);
    //console.assert(pattern.height === new_pattern.height);

    for(let y = bounds.top; y <= bounds.bottom; y++)
    {
        for(let x = bounds.left; x <= bounds.right; x++)
        {
            console.assert(life.get_bit(x, y) === new_life.get_bit(x, y));
        }
    }
}
