# Closure Compiler
# 
# To compile, get the script from http://closure-compiler.googlecode.com/files/compiler-latest.zip
# And put it into ~/.local or change the path below

FILENAME="life-compressed.js"

ls -l $FILENAME

java -jar ~/.local/closure-compiler.jar \
    --compilation_level ADVANCED_OPTIMIZATIONS\
    --language_in ECMASCRIPT5_STRICT\
    --js_output_file $FILENAME\
    --warning_level VERBOSE\
    --js draw.js life.js formats.js main.js 

ls -l $FILENAME
