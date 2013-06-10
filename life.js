"use strict";

/** @constructor */
function LifeUniverse()
{
    /** @const */
    var LOAD_FACTOR = .6,
        INITIAL_SIZE = 20;

    var 
        // last id for nodes
        /** @type {number} */
        last_id,

        // Size of the hashmap. 
        // Always a power of 2 minus 1
        hashmap_size,


        // Size when the next GC will happen
        max_load,


        // living or dead leaf
        true_leaf,
        false_leaf,

        // the hashmap
        hashmap,

        life = this;

    // current rule setting
    /** @type {number} */
    this.rule_b = 0;
    /** @type {number} */
    this.rule_s = 0;

    this.root = null;

    /** 
     * number of generations to calculate at one time,
     * written as 2^n
     * @type {number}
     */
    this.step = 0;

    // in which generation are we
    /** @type {number} */
    this.generation = 0;

    this.get_bounds = get_bounds;
    this.clear_pattern = clear_pattern;
    this.make_center = make_center;
    this.setup_field = setup_field;
    this.move_field = move_field;
    this.setup_meta = setup_meta;
    this.set_step = set_step;
    this.set_rules = set_rules;
    this.set_bit = set_bit;
    this.get_bit = get_bit;
    this.next_generation = next_generation;

            
    false_leaf =
    {
        id: 2,
        population: 0,
        level: 0,
        
        set_bit: function(x, y, living)
        {
            return living ? true_leaf : false_leaf;
        },

        get_bit: function()
        {
            return false;
        },

        get_field : function(x, y, field)
        {
        }
    };

    true_leaf =
    {
        id: 1,
        population: 1,
        level: 0,
        
        set_bit : function(x, y, living)
        {
            return living ? true_leaf : false_leaf;
        },

        get_bit : function()
        {
            return true;
        },

        get_field: function(x, y, field)
        {
            field.push({ x: x, y: y });
        }
    };


    /**
     * @constructor
     */
    function TreeNode(nw, ne, sw, se)
    {
        this.nw = nw;
        this.ne = ne;
        this.sw = sw;
        this.se = se;

        this.id = last_id++;
        
        // 2^level = width of area
        this.level = nw.level + 1;

        this.population = nw.population + ne.population + sw.population + se.population;

        // one generation forward
        this.cache = null;

        // 2^(level - 2) generations forward
        this.quick_cache = null;

        /*if(this.population === 0)
        {
            this.cache = this.quick_cache = nw;
        }*/
    }

    TreeNode.prototype = 
    {
        set_bit : function(x, y, living)
        {
            var offset = pow2(this.level - 1) / 2,
                nw = this.nw,
                ne = this.ne,
                sw = this.sw,
                se = this.se;
            
            if(x < 0)
            {
                if(y < 0)
                {
                    nw = nw.set_bit(x + offset, y + offset, living);
                }
                else
                {
                    sw = sw.set_bit(x + offset, y - offset, living);
                }
            }
            else
            {
                if(y < 0)
                {
                    ne = ne.set_bit(x - offset, y + offset, living);
                }
                else
                {
                    se = se.set_bit(x - offset, y - offset, living);
                }
            }

            return create_tree(nw, ne, sw, se);
        },

        get_bit : function(x, y)
        {
            if(this.population === 0)
            {
                return false;
            }

            var offset = pow2(this.level - 1) / 2;
            
            if(x < 0)
            {
                if (y < 0)
                {
                    return this.nw.get_bit(x + offset, y + offset);
                }
                else
                {
                    return this.sw.get_bit(x + offset, y - offset);
                }
            }
            else
            {
                if(y < 0)
                {
                    return this.ne.get_bit(x - offset, y + offset);
                }
                else
                {
                    return this.se.get_bit(x - offset, y - offset);
                }
            }
        },
        
        get_field : function(left, top, field)
        {
            if(this.population === 0)
            {
                return;
            }

            var offset = pow2(this.level - 1);
        
            this.nw.get_field(left, top, field);
            this.ne.get_field(left + offset, top, field);
            this.sw.get_field(left, top + offset, field);
            this.se.get_field(left + offset, top + offset, field);
        },

        level2_next : function()
        {
            var nw = this.nw,
                ne = this.ne,
                sw = this.sw,
                se = this.se,
                bitmask = 
                    nw.nw.population << 15 | nw.ne.population << 14 | ne.nw.population << 13 | ne.ne.population << 12 |
                    nw.sw.population << 11 | nw.se.population << 10 | ne.sw.population <<  9 | ne.se.population <<  8 |
                    sw.nw.population <<  7 | sw.ne.population <<  6 | se.nw.population <<  5 | se.ne.population <<  4 |
                    sw.sw.population <<  3 | sw.se.population <<  2 | se.sw.population <<  1 | se.se.population;

            return create_tree(
                eval_mask(bitmask >> 5), 
                eval_mask(bitmask >> 4), 
                eval_mask(bitmask >> 1), 
                eval_mask(bitmask)
            );

            function eval_mask(bitmask)
            {
                var rule = (bitmask >> 5 & 1) ? life.rule_s : life.rule_b,
                    neighbours = 0;
                    
                bitmask &= 0x757;
                
                while(bitmask)
                {
                    neighbours++;
                    bitmask &= bitmask - 1;
                }
                
                if(rule & 1 << neighbours)
                {
                    return true_leaf;
                }
                else
                {
                    return false_leaf;
                }
            }
        },

        next_generation : function()
        {
            if(this.cache)
            {
                return this.cache;
            }

            if(life.step === this.level - 2)
            {
                return this.quick_next_generation();
            }
            
            if(this.level === 2)
            {
                if(this.quick_cache)
                {
                    return this.quick_cache;
                }
                else
                {
                    return this.quick_cache = this.level2_next();
                }
            }
            
            var nw = this.nw,
                ne = this.ne,
                sw = this.sw,
                se = this.se,
                n00 = create_tree(nw.nw.se, nw.ne.sw, nw.sw.ne, nw.se.nw), 
                n01 = create_tree(nw.ne.se, ne.nw.sw, nw.se.ne, ne.sw.nw), 
                n02 = create_tree(ne.nw.se, ne.ne.sw, ne.sw.ne, ne.se.nw), 
                n10 = create_tree(nw.sw.se, nw.se.sw, sw.nw.ne, sw.ne.nw), 
                n11 = create_tree(nw.se.se, ne.sw.sw, sw.ne.ne, se.nw.nw), 
                n12 = create_tree(ne.sw.se, ne.se.sw, se.nw.ne, se.ne.nw), 
                n20 = create_tree(sw.nw.se, sw.ne.sw, sw.sw.ne, sw.se.nw), 
                n21 = create_tree(sw.ne.se, se.nw.sw, sw.se.ne, se.sw.nw), 
                n22 = create_tree(se.nw.se, se.ne.sw, se.sw.ne, se.se.nw);

            return this.cache = create_tree(
                create_tree(n00, n01, n10, n11).next_generation(),
                create_tree(n01, n02, n11, n12).next_generation(),
                create_tree(n10, n11, n20, n21).next_generation(),
                create_tree(n11, n12, n21, n22).next_generation()
            );
        },

        quick_next_generation : function()
        {
            if(this.quick_cache !== null)
            {
                return this.quick_cache;
            }

            if(this.level === 2)
            {
                return this.quick_cache = this.level2_next();
            }

            var nw = this.nw,
                ne = this.ne,
                sw = this.sw,
                se = this.se,
                n00 = nw.quick_next_generation(),
                n01 = create_tree(nw.ne, ne.nw, nw.se, ne.sw).quick_next_generation(),
                n02 = ne.quick_next_generation(),
                n10 = create_tree(nw.sw, nw.se, sw.nw, sw.ne).quick_next_generation(),
                n11 = create_tree(nw.se, ne.sw, sw.ne, se.nw).quick_next_generation(),
                n12 = create_tree(ne.sw, ne.se, se.nw, se.ne).quick_next_generation(),
                n20 = sw.quick_next_generation(),
                n21 = create_tree(sw.ne, se.nw, sw.se, se.sw).quick_next_generation(),
                n22 = se.quick_next_generation();

            
            return this.quick_cache = create_tree(
                create_tree(n00, n01, n10, n11).quick_next_generation(),
                create_tree(n01, n02, n11, n12).quick_next_generation(),
                create_tree(n10, n11, n20, n21).quick_next_generation(),
                create_tree(n11, n12, n21, n22).quick_next_generation()
            );
        },

        hash : function()
        {
            if(add_hash(this))
            {
                if(this.level > 1)
                {
                    this.nw.hash();
                    this.ne.hash();
                    this.sw.hash();
                    this.se.hash();
                    
                    if(this.cache) {
                        this.cache.hash();
                    }
                    if(this.quick_cache) {
                        this.quick_cache.hash();
                    }
                }
            }
        },


    };


    function set_bit(x, y, living)
    {
        var level = get_level_from_bounds({ x: x, y: y });

        if(living)
        {
            while(level > life.root.level)
            {
                life.root = expand_universe(life.root);
            }
        }
        else
        {
            if(level > life.root.level) {
                return;
            }
        }
        
        life.root = life.root.set_bit(x, y, living);
    }

    function get_bit(x, y)
    {
        var level = get_level_from_bounds({ x: x, y: y });

        if(level > life.root.level)
        {
            return false;
        }
        else
        {
            return life.root.get_bit(x, y);
        }
    }

    function empty_tree(level)
    {
        if(level === 0) {
            return false_leaf;
        }
            
        var t = empty_tree(level - 1);
            
        return create_tree(t, t, t, t);
    }

    function expand_universe(node)
    {
        var t = empty_tree(node.level - 1);
        
        return create_tree(
            create_tree(t, t, t, node.nw),
            create_tree(t, t, node.ne, t),
            create_tree(t, node.sw, t, t),
            create_tree(node.se, t, t, t)
        );
    }

    // Preserve the tree, but remove all cached 
    // generations forward
    function uncache(also_quick)
    {
        for(var i = 0; i <= hashmap_size; i++)
        {
            var node = hashmap[i];

            if(node !== undefined)
            {
                node.cache = null;

                if(also_quick)
                    node.quick_cache = null;
            }
        }
    }

    function calc_hash(nw, ne, sw, se)
    {
        //var hash = 0x1a2f,
        //    k;

        //k = nw.id * 0xcc9e2d51;
        //k = k << 15 | k >> 17;
        //k = k * 0x1b873593;
        //hash = hash ^ k;
        //hash = hash << 13 | hash >> 19;
        //hash = hash * 5 + 0xe6546b64

        //k = ne.id * 0xcc9e2d51;
        //k = k << 15 | k >> 17;
        //k = k * 0x1b873593;
        //hash = hash ^ k;
        //hash = hash << 13 | hash >> 19;
        //hash = hash * 5 + 0xe6546b64

        //k = sw.id * 0xcc9e2d51;
        //k = k << 15 | k >> 17;
        //k = k * 0x1b873593;
        //hash = hash ^ k;
        //hash = hash << 13 | hash >> 19;
        //hash = hash * 5 + 0xe6546b64

        //k = se.id * 0xcc9e2d51;
        //k = k << 15 | k >> 17;
        //k = k * 0x1b873593;
        //hash = hash ^ k;
        //hash = hash << 13 | hash >> 19;
        //hash = hash * 5 + 0xe6546b64

        //hash = hash ^ (hash >> 16);
        //hash = hash * 0x85ebca6b;
        //hash = hash ^ (hash >> 13);
        //hash = hash * 0xc2b2ae35;
        //hash = hash ^ (hash >> 16);

        //var hash = nw.id + ne.id * 117 + sw.id * 1201 + se.id * 65437;
        //hash ^= hash >> 16 ^ hash >> 7;


        var hash = nw.id;
        hash = ne.id + (hash << 6) + (hash << 16) - hash;
        hash = se.id + (hash << 6) + (hash << 16) - hash;
        hash = sw.id + (hash << 6) + (hash << 16) - hash;


        //var hash = nw.id * 33 + 720;
        //hash = hash * 33 + ne.id + 720;
        //hash = hash * 33 + sw.id + 720;
        //hash = hash * 33 + se.id + 720;


        //var hash = 5381;
        //hash = (hash << 5) + hash + nw.id;
        //hash = (hash << 5) + hash + ne.id;
        //hash = (hash << 5) + hash + sw.id;
        //hash = (hash << 5) + hash + se.id;

        //var hash = 0;
        //hash += nw.id;
        //hash += hash << 10;
        //hash ^= hash >> 6;
        //hash += ne.id;
        //hash += hash << 10;
        //hash ^= hash >> 6;
        //hash += sw.id;
        //hash += hash << 10;
        //hash ^= hash >> 6;
        //hash += se.id;
        //hash += hash << 10;
        //hash ^= hash >> 6;

        //var hash = 2166136261;
        //hash ^= nw.id;
        //hash = hash * 16777619;
        //hash ^= ne.id;
        //hash = hash * 16777619;
        //hash ^= sw.id;
        //hash = hash * 16777619;
        //hash ^= se.id;
        //hash = hash * 16777619;
        
        //var hash = nw.id;
        //hash *= 37;
        //hash += ne.id;
        //hash *= 37;
        //hash += sw.id;
        //hash *= 37;
        //hash += se.id;

        return hash;
    }

    // Hash a node, return false if it was hashed before.
    function add_hash(n)
    {
        var hash = calc_hash(n.nw, n.ne, n.sw, n.se);

        for(var node;;)
        {
            hash &= hashmap_size;

            var node = hashmap[hash];

            if(node === undefined)
            {
                // Update the id. We have looked for an old id, as
                // the the hashmap has been cleared and ids have been
                // reset, but this cannot avoided without iterating
                // the tree twice.
                n.id = last_id++;

                hashmap[hash] = n;

                return true;
            }
            else if(node.nw === n.nw && node.ne === n.ne && node.sw === n.sw && node.se === n.se)
            {
                return false;
            }

            hash++;
        }
    }

    function create_tree(nw, ne, sw, se)
    {
        var hash = calc_hash(nw, ne, sw, se);

        for(var node;;)
        {
            hash &= hashmap_size;

            var node = hashmap[hash];

            if(node === undefined)
            {
                if(last_id > max_load)
                {
                    garbage_collect();
                    return create_tree(nw, ne, sw, se);
                }

                return hashmap[hash] = new TreeNode(nw, ne, sw, se);
            }
            else if(node.nw === nw && node.ne === ne && node.sw === sw && node.se === se)
            {
                return node;
            }

            // "Open Addressing" - simply try the next cell
            hash++;
        }

        // "normal" buckets
        /*
        var entry = hashmap[hash],
            node;
        
        if(entry === undefined)
        {
            return hashmap[hash] = new TreeNode(nw, ne, sw, se);
        }
        else if(entry instanceof Array)
        {
            if(x < entry.length) x = entry.length, y = [nw, ne, sw, se, hash];
            for(var i = 0; i < entry.length; i++)
            {
                node = entry[i];

                if(node.nw === nw && node.ne === ne && node.sw === sw && node.se === se)
                {
                    return node;
                }
            }

            node = new TreeNode(nw, ne, sw, se);

            entry.push(node);

            return node;
        }
        else
        {
            if(entry.nw === nw && entry.ne === ne && entry.sw === sw && entry.se === se)
            {
                return entry;
            }
            else
            {
                node = new TreeNode(nw, ne, sw, se);

                hashmap[hash] = [entry, node];

                return node;
            }
        }/* */
    }


    function next_generation(is_single)
    {
        var root = life.root;

        while(
            (is_single && life.step > root.level - 2) || 
            root.nw.population !== root.nw.se.se.population ||
            root.ne.population !== root.ne.sw.sw.population ||
            root.sw.population !== root.sw.ne.ne.population ||
            root.se.population !== root.se.nw.nw.population)
        {
            root = expand_universe(root);
        }

        if(is_single)
        {
            life.generation += pow2(life.step);
            root = root.next_generation();
        }
        else
        {
            life.generation += pow2(life.root.level - 2);
            root = root.quick_next_generation();
        }

        life.root = root;
    }

    function garbage_collect()
    {
        //document.getElementById("pattern_name").textContent = last_id + " / " + (last_id / hashmap_size).toFixed(5);
        //console.log("entries: " + last_id);
        //console.log("load factor: " + last_id / hashmap_size);

        //console.log("collecting garbage ...");
        //var t = Date.now();

        hashmap_size = hashmap_size << 1 | 1;
        max_load = hashmap_size * LOAD_FACTOR | 0;

        for(var i = 0; b <= hashmap_size; i++)
            hashmap[i] = undefined;

        last_id = 3;
        life.root.hash();
        //console.log("done in " + (Date.now() - t));
        //console.log("last id: " + last_id);
        //console.log("new hashmap size: " + hashmap_size);
        //console.log("size: " + hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));
    }

    /*
    function garbage_collect()
    {
        var previous_size = hashmap_size,
            new_hashmap = [];
        
        hashmap_size = hashmap_size << 1 | 1;
        max_load = hashmap_size * LOAD_FACTOR | 0;

        for(var i = 0; i <= hashmap_size; i++)
        {
            new_hashmap[i] = undefined
        }

        for(var i = 0; i <= previous_size; i++)
        {
            var node = hashmap[i],
                hash;

            if(node !== undefined)
            {
                hash = calc_hash(node.nw, node.ne, node.sw, node.se);

                for(;;)
                {
                    hash &= hashmap_size;

                    if(new_hashmap[i] === undefined)
                    {
                        new_hashmap[i] = node;
                        break;
                    }

                    hash++;
                }
            }
        }
        console.log("Garbage collected!");
        console.log("Last id: " + last_id);
        console.log("old size: " + hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));
        console.log("new size: " + new_hashmap.reduce(function(a, x) { return a + (x !== undefined); }, 0));

        hashmap = new_hashmap;
    }*/

    function clear_pattern()
    {
        last_id = 3;
        hashmap_size = (1 << INITIAL_SIZE) - 1;
        max_load = hashmap_size * LOAD_FACTOR | 0;
        hashmap = [];

        for(var i = 0; i <= hashmap_size; i++)
            hashmap[i] = undefined;

        life.root = empty_tree(3);
        life.generation = 0;
    }

    function get_bounds(field)
    {
        if(!field.length)
        {
            return {
                top: 0,
                left: 0,
                bottom: 0,
                right: 0
            };
        }

        var bounds = {
                top : field[0].y, 
                left : field[0].x, 
                bottom : field[0].y, 
                right : field[0].x
            },
            len = field.length;
        
        for(var i = 1; i < len; i++)
        {
            var x = field[i].x,
                y = field[i].y;
            
            if(x < bounds.left)
            {
                bounds.left = x;
            }
            else if(x > bounds.right)
            {
                bounds.right = x;
            }
            
            if(y < bounds.top)
            {
                bounds.top = y;
            }
            else if(y > bounds.bottom)
            {
                bounds.bottom = y;
            }
        }
        
        return bounds;
    }

    /*
     * given a point { x, y } or a bounds object { left, top, bottom, right },
     * return the quadtree level that is required to contain this point
     */
    function get_level_from_bounds(bounds)
    {
        // root should always be at least level 3
        var max = 4,
            keys = Object.keys(bounds);

        for(var i = 0; i < keys.length; i++)
        {
            var coordinate = bounds[keys[i]];

            if(coordinate + 1 > max) {
                max = coordinate + 1;
            }
            else if(-coordinate > max) {
                max = -coordinate;
            }
        }
        
        return Math.ceil(Math.log(max) / Math.LN2) + 1;
    }

    function field2tree(field, level)
    {
        var tree = make_node(),
            len = field.length;

        function make_node()
        {
            return { nw: false, ne: false, sw: false, se: false };
        }

        for(var i = 0; i < len; i++)
        {
            var x = field[i].x,
                y = field[i].y,
                node = tree;

            for(var j = level - 2; j >= 0; j--)
            {
                var offset = pow2(j);

                if(x < 0)
                {
                    x += offset;
                    if(y < 0)
                    {
                        y += offset;
                        if(!node.nw) {
                            node.nw = make_node();
                        }
                        node = node.nw;
                    }
                    else
                    {
                        y -= offset;
                        if(!node.sw) {
                            node.sw = make_node();
                        }
                        node = node.sw;
                    }
                }
                else
                {
                    x -= offset;
                    if(y < 0)
                    {
                        y += offset;
                        if(!node.ne) {
                            node.ne = make_node();
                        }
                        node = node.ne;
                    }
                    else
                    {
                        y -= offset;
                        if(!node.se) {
                            node.se = make_node();
                        }
                        node = node.se;
                    }
                }
            }

            if(x < 0)
            {
                if(y < 0) {
                    node.nw = true;
                }
                else {
                    node.sw = true;
                }
            }
            else
            {
                if(y < 0) {
                    node.ne = true;
                }
                else {
                    node.se = true;
                }
            }
        }

        return tree;
    }

    /*
     * move a field so that (0,0) is in the middle
     */
    function make_center(field, bounds)
    {
        var offset_x = Math.round((bounds.left - bounds.right) / 2) - bounds.left,
            offset_y = Math.round((bounds.top - bounds.bottom) / 2) - bounds.top;

        move_field(field, offset_x, offset_y);

        bounds.left += offset_x;
        bounds.right += offset_x;
        bounds.top += offset_y;
        bounds.bottom += offset_y;
    }

    function move_field(field, offset_x, offset_y)
    {
        var len = field.length;

        for(var i = 0; i < len; i++)
        {
            field[i].x += offset_x;
            field[i].y += offset_y;
        }
    }

    /** @param {*=} bounds */
    function setup_field(field, bounds)
    {
        if(!bounds) {
            bounds = get_bounds(field);
        }

        //var t = Date.now();
        var level = get_level_from_bounds(bounds),
            node = field2tree(field, level);

        //console.log("field to tree", Date.now() - t);

        //t = Date.now();

        life.root = setup_field_from_tree(node, level);
        //console.log("setup field", Date.now() - t);
    }

    function setup_field_from_tree(node, level)
    {
        if(level === 1)
        {
            return create_tree(
                node.nw ? true_leaf : false_leaf,
                node.ne ? true_leaf : false_leaf,
                node.sw ? true_leaf : false_leaf,
                node.se ? true_leaf : false_leaf
            );
        }
        else
        {
            level--;

            return create_tree(
                node.nw ? setup_field_from_tree(node.nw, level) : empty_tree(level),
                node.ne ? setup_field_from_tree(node.ne, level) : empty_tree(level),
                node.sw ? setup_field_from_tree(node.sw, level) : empty_tree(level),
                node.se ? setup_field_from_tree(node.se, level) : empty_tree(level)
            );
        }
    }

    function setup_meta(otca_on, otca_off, field, bounds)
    {
        var level = get_level_from_bounds(bounds),
            node = field2tree(field, level);


        life.root = setup_meta_from_tree(node, level + 11);

        function setup_meta_from_tree(node, level)
        {
            if(level === 11)
            {
                return node ? otca_on : otca_off;
            }
            else if(!node)
            {
                var dead = setup_meta_from_tree(false, level - 1);

                return create_tree(dead, dead, dead, dead);
            }
            else
            {
                level--;

                return create_tree(
                    setup_meta_from_tree(node.nw, level),
                    setup_meta_from_tree(node.ne, level),
                    setup_meta_from_tree(node.sw, level),
                    setup_meta_from_tree(node.se, level)
                );
            }
        }
    }


    function get_field(node)
    {
        var offset = pow2(node.level - 1),
            field = [];

        node.get_field(-offset, -offset, field);
        
        return field;
    }

    function set_step(step)
    {
        if(step !== life.step)
        {
            life.step = step;

            if(life.generation > 0) {
                uncache(false);
            }
        }
    }

    function set_rules(s, b)
    {
        if(life.rule_s !== s || life.rule_b !== b)
        {
            life.rule_s = s;
            life.rule_b = b;

            if(life.generation > 0) {
                uncache(true);
            }
        }
    }
}
