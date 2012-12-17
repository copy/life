FILENAME="out.js"

ls -l $FILENAME

java -jar ~/.local/closure-compiler.jar \
	--compilation_level ADVANCED_OPTIMIZATIONS\
	--js_output_file $FILENAME\
	--warning_level VERBOSE\
	--js draw.js life.js formats.js main.js 

ls -l $FILENAME
