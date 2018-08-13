"use strict";

function load_macrocell(universe, text)
{
    const lines = text.split("\n");

    if(!lines[0].startsWith("[M2]"))
    {
        return;
    }

    let tree_start = 0;

    for(let i = 1; i < lines.length; i++)
    {
        if(lines[i][0] !== "#")
        {
            tree_start = i;
            break;
        }
    }

    if(!tree_start)
    {
        return;
    }

    const nodes = [];
    nodes[0] = undefined; // special: Empty pattern

    for(let i = tree_start; i < lines.length; i++)
    {
        const line = lines[i];
        const first = line[0];

        if(first === "$" || first === "." || first === "*")
        {
            const xs = [];
            const ys = [];
            let x = 0;
            let y = 0;

            for(let j = 0; j < line.length; j++)
            {
                const piece = line[j];

                if(piece === "$")
                {
                    x = 0;
                    y++;
                    console.assert(y <= 8, "x");
                }
                else if(piece === ".")
                {
                    x++;
                    console.assert(x <= 8, "y");
                }
                else if(piece === "*")
                {
                    xs.push(x);
                    ys.push(y);
                    x++;
                }
                else if(piece === "\r")
                {
                }
                else
                {
                    console.assert(false, "Unexpected piece: '" + piece + "'");
                }
            }

            // leaf
            const node = universe.setup_field_recurse(
                0,
                xs.length - 1,
                xs,
                ys,
                3
            );

            nodes.push(node);
        }
        else if(line === "")
        {
        }
        else
        {
            // node
            const parts = line.split(" ");
            console.assert(parts.length === 5, "length");
            let [level, nw, ne, sw, se] = parts;
            level = +level;
            nw = +nw;
            ne = +ne;
            sw = +sw;
            se = +se;

            console.assert(level >= 4);
            console.assert(nw >= 0);
            console.assert(ne >= 0);
            console.assert(sw >= 0);
            console.assert(se >= 0);

            const nw_node = nw === 0 ? universe.empty_tree(level - 1) : nodes[nw];
            const ne_node = ne === 0 ? universe.empty_tree(level - 1) : nodes[ne];
            const sw_node = sw === 0 ? universe.empty_tree(level - 1) : nodes[sw];
            const se_node = se === 0 ? universe.empty_tree(level - 1) : nodes[se];

            console.assert(nw_node.level === level - 1);
            console.assert(nw_node);
            console.assert(ne_node);
            console.assert(sw_node);
            console.assert(se_node);

            const node = universe.create_tree(nw_node, ne_node, sw_node, se_node);
            nodes.push(node);
        }
    }

    universe.root = nodes[nodes.length - 1];

    return formats.parse_comments(text.substr(text.indexOf("\n") + 1), "#");
}

//if(false)
//{
//    const vm = require("vm");
//    const fs = require("fs");
//
//    vm.runInThisContext(fs.readFileSync("./formats.js"), { filename: "formats.js" });
//    vm.runInThisContext(fs.readFileSync("./life.js"), { filename: "life.js" });
//
//    const text = fs.readFileSync("TetrisOTCAMP.mc", "utf8");
//
//    load_macrocell(text);
//}
