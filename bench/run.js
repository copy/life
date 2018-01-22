load("../life.js");
load("../formats.js");

load("gemini.js"); // defines gemini_rle
load("primer.js"); // defines primer_rle


function assert(x, msg)
{
    if(!x)
        print("Assert failed: " + msg);
}

function measure(name, f)
{
    var timer = Date.now();
    f();
    console.log(name + ": " + (Date.now() - timer));
}

var console = {
    log : function(x)
    {
        print(x);
    }
};



function load_and_run(pattern_str, name, tests)
{
    var timer,
        life = new LifeUniverse(),
        pattern,
        bounds;


    print("Testing: " + name);

    timer = Date.now();
    pattern = formats.parse_pattern(pattern_str);
    print("  parse_pattern " + (Date.now() - timer));

    bounds = life.get_bounds(pattern.field_x, pattern.field_y);

    assert(!pattern.error, pattern.error);


    life.clear_pattern();

    life.make_center(pattern.field_x, pattern.field_y, bounds);

    timer = Date.now();
    life.setup_field(pattern.field_x, pattern.field_y, bounds);
    print("  setup_field " + (Date.now() - timer));

    for(var i = 0; i < tests.length; i++)
    {
        timer = Date.now();

        var rep = tests[i].repetitions || 1;

        for(var j = 0; j < rep; j++)
            tests[i].f(life);

        print("  " + tests[i].name + ": " + (Date.now() - timer));
    }

    print("");
}


load_and_run(
    gemini_rle,
    "gemini",
    [
        {
            name: "next generation",
            f: function(life) {
                life.next_generation(true);
            },
            repetitions: 5
        },

        {
            name: "16 generations",
            f: function(life) {
                life.set_step(4); // 16 generations at once

                for(var i = 0; i < 1; i++)
                    life.next_generation(true);
            },
        },

        //{
        //    name: "4096 generations",
        //    f: function(life) {
        //        life.set_step(12);

        //        life.next_generation(true);
        //    },
        //},
    ]
);


load_and_run(
    primer_rle,
    "primer",
    [
        {
            name: "next generation",
            f: function(life) {
                life.next_generation(true);
            },
            repetitions: 5000
        },

        {
            name: "256 generations",
            f: function(life) {
                life.set_step(8); // 256 generations at once

                for(var i = 0; i < 500; i++)
                    life.next_generation(true);
            },
        },

        {
            name: "q generation",
            f: function(life) {

                life.next_generation(false);
            },
        },
    ]
);
