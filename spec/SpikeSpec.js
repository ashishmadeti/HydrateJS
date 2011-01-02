describe("Spike", function() {
  var spike;
  beforeEach(function() {
    spike = new Spike();
  });
  function extend(subclass, superclass){
    if(Spike.Util.supportsProto){
      subclass.prototype.__proto__ = superclass.prototype
    } else {
      subclass.prototype = new superclass()
      subclass.prototype.constructor = subclass
    }
  }
  
  function BasicClass(){
    this.foo = "bar";
  }
  BasicClass.prototype.candy = function(){ return "sweet"; };
  
  function BasicSubclass(){
    this.foo = "baz";
  }
  extend(BasicSubclass, BasicClass);

  it("should serialize primitives", function() {
    var inputs = [3, "foo", ["a", 3, "bar"]]
    var i = spike.parse(spike.stringify(3))
    for(var i = 0; i < inputs.length; i++){
      var input = inputs[i];
      expect(spike.parse(spike.stringify(input))).toEqual(input);
    }
  });
  
  it("should not serialize functions (when called directly)", function(){
    expect(function(){
      spike.stringify(function(){});
    }).toThrow();
  });
  
  it("should serialize basic hashes", function(){
    var input = {a: "f", b: 3, 1: 4, c: [1, 2, 3], d: {e: "f", g: 9}};
    var string = spike.stringify(input);
    var output = spike.parse(string);
    expect(output).toEqual(input);
  });
  
  it("should serialize objects with prototypes exported to the window", function(){
    window.BasicClass = BasicClass;
    this.after(function(){
      window.BasicClass = null;
    });
    var instance = new BasicClass;
    instance.baz = 2;
    var string = spike.stringify(instance);
    var output = spike.parse(string);
    expect(output.foo).toEqual("bar");
    expect(output.baz).toEqual(2);
    expect(output).toSubclass(BasicClass);
  });
  
  it("should serialize objects with prototype chains", function(){
    window.BasicClass = BasicClass;
    window.BasicSubclass = BasicSubclass;
    this.after(function(){
      window.BasicClass = null;
      window.BasicSubclass = null;
    });
        
    var instance = new BasicSubclass;
    instance.a = 2;
    
    // this doesn't work!  can't add methods onto non-prototypes
    instance.newMethod = function(){ };
    
    // normally it'd throw an exception, but we're eating it here
    spike.setErrorHandler(function(){});
    var string = spike.stringify(instance);
    var output = spike.parse(string);
    expect(output.foo).toEqual("baz");
    expect(output.a).toEqual(2);
    expect(output.candy()).toEqual("sweet");
    expect(function(){ output.newMethod(); }).toThrow();
    expect(output).toSubclass(BasicSubclass);
    expect(output).toSubclass(BasicClass);
  });
  
  it("should serialize objects with object references", function(){
    function ObjRefClass(){
      this.k = new BasicClass();
    }
    window.ObjRefClass = ObjRefClass;
    window.BasicClass = BasicClass;
    this.after(function(){
      window.ObjRefClass = null;
      window.BasicClass = null;
    });
    
    var instance = new ObjRefClass;
    
    var string = spike.stringify(instance);
    var output = spike.parse(string);
    
    expect(output).toSubclass(ObjRefClass);
    expect(output.k).toSubclass(BasicClass);
    expect(output.k.foo).toEqual("bar");
  });
  
  describe("Multiple references to same object", function(){
    beforeEach(function(){
      window.BasicClass = BasicClass;
    });
    afterEach(function(){
      window.BasicClass = null;
    });
    
    it("should handle multiple references to the same object correctly, in an array", function(){
      var a = new BasicClass();
      var input = [a, a];
      
      var string = spike.stringify(input);
      var output = spike.parse(string);
      
      expect(output[0]).toBe(output[1]);
      expect(output[0]).toSubclass(BasicClass);
    });
    
    it("should handle multiple references to the same object correctly, in a hash", function(){
      var a = new BasicClass();
      var input = {one: a, two: a};
      
      var string = spike.stringify(input);
      var output = spike.parse(string);
      
      expect(output.one).toBe(output.two);
    });
  })
  
  it("should handle circular references", function(){
    function FirstClass(){
      this.k = new SecondClass();
    }
    function SecondClass(){
      this.foo = "bar";
    }
    window.FirstClass = FirstClass;
    window.SecondClass = SecondClass;
    this.after(function(){
      window.FirstClass = null;
      window.SecondClass = null;
    });
    
    var instance = new FirstClass();
    instance.k.j = instance; // here the second class instance is referring to the first class
    
    var string = spike.stringify(instance);
    var output = spike.parse(string);
    
    expect(output).toSubclass(FirstClass);
    expect(output.k).toSubclass(SecondClass);
    expect(output.k.j).toSubclass(FirstClass);
    expect(output.k.j).toBe(output);
    expect(output.k.foo).toEqual("bar");
  });
  
  function generateSampleSet(){
    var arr = [];
    var size = 1000;
    for(var i = 0; i < size; i++){
      var obj = new BasicClass();
      arr.push(obj);
    }
    for(var i = 0; i < size; i++){
      var obj = arr[i];
      for(var j = 0; j < 2; j++){
        switch(Math.floor(Math.random()*5)){
        case 0:
          obj.number = Math.random() * 100;
          if(Math.random() < 0.5) obj.number = Math.floor(obj.number);
          break;
        case 1:
          obj.str = "Foo!";
          break;
        case 2:
          obj.other_1 = new BasicClass();
          break;
        case 3:
          var idx = Math.floor(Math.random()*size);
          obj.other_2 = arr[idx];
          break;
        }
      }
    }
    return arr;
  }
  function stringifySampleSet(runs){
    var testSet = generateSampleSet();
    var time = new Date();
    var primer = spike.stringify(testSet);
    var str = primer;
    for(var i = 1; i < runs; i++){
      str = spike.stringify(testSet);
    }
    var total_time = new Date() - time;
    return {
      time: total_time,
      primer: primer,
      string: str
    };
  }
  function parseSampleSet(runs, str){
    var time = new Date();
    var primer = spike.parse(str);
    var obj = primer;
    for(var i = 1; i < runs; i++){
      obj = spike.parse(str);
    }
    var total_time = new Date() - time;
    return {
      time: total_time,
      primer: primer,
      object: obj
    };
  }
  describe("performance", function(){
    it("should not be terrible when stringifying", function(){
      var runs = 500;
      var results = stringifySampleSet(runs);
      var run_time = results.time / runs;
      
      var msg = "took " + results.time + "ms total, " + run_time + "ms per run (and " + runs + " runs)";
      if(window.console) console.log(msg);
      else alert(msg);
      window.result = results;
    });
    
    it("should not be terrible when parsing", function(){
      var runs = 500;
      window.BasicClass = BasicClass;
      this.after(function(){
        window.BasicClass = null;
      });
      var pre_results = stringifySampleSet(1);
      var results = parseSampleSet(runs, pre_results.string);
      var run_time = results.time / runs;
      
      var msg = "took " + results.time + "ms total, " + run_time + "ms per run (and " + runs + " runs)";
      if(window.console) console.log(msg);
      else alert(msg);
    });
  });
});
