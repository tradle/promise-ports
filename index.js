var Q = require('q');
var natUpnp = require('nat-upnp');
var defaults = require('defaults');

function Client() {
  if (!(this instanceof Client)) return new Client();

  this.client = natUpnp.createClient();
}

Client.prototype.mapPorts = function(/* mappings */) {
  var self = this;

  var tasks = [].map.call(arguments, function(mapping) {
    return self.mapPort(mapping);
  });

  return Q.all(tasks);
}

Client.prototype.mapPort = function(options) {
  if (arguments.length === 2) {
    options = {
      public: arguments[0],
      private: arguments[1]
    }
  }

  var client = this.client;
  var prep;
  if (options.hijack) 
    prep = this.unmapPort(options.public);
  else {
    prep = this.isMappingAvailable(options)
      .then(function(available) {
        if (!available) throw new Error('This mapping conflicts with an existing mapping');
      });
  }

  return prep.then(function() {
    return Q.ninvoke(client, 'portMapping', defaults(options, {
      ttl: 10,
      protocol: 'TCP'
    }));
  }) 
}

Client.prototype.isMappingAvailable = function(options) {
  var client = this.client;
  var myIp;
  return Q.all([
    Q.ninvoke(client, 'findGateway'),
    Q.ninvoke(client, 'getMappings')
  ]).spread(function(gatewayResult, mappings) {
    myIp = gatewayResult[1];
    var conflict;

    mappings.some(function(mapping) {
      if (mapping.private.host !== myIp &&
          (mapping.public.port === options.public.port || mapping.private.port === options.private.port)) {
        conflict = mapping;
        return true;
      }
    });

    return !conflict;
  });
}

Client.prototype.clearMappings = function(options) {
  var client = this.client;
  options = options || { local: true };
  // var remoteHost;
  var ports = options.ports;
  var protocol = options.protocol;
  if (protocol) protocol = protocol.toUpperCase();

  return Q.ninvoke(client, 'getMappings', options)
    .then(function(results) {
      var tasks = results.map(function(mapping) {
        // debugger;
        if (ports && ports.indexOf(mapping.public.port) === -1) return;
        if (protocol && mapping.protocol.toUpperCase() !== protocol) return;

        var pub = mapping.public;

        // if (!pub.host) pub.host = remoteHost;

        return Q.ninvoke(client, 'portUnmapping', {
          public: pub
        });
      });

      return Q.allSettled(tasks);
    });
}

Client.prototype.unmapPort = function(pub) {
  return this.clearMappings({
    ports: [pub]
  })
}

Client.prototype.externalIp = function() {
  return Q.ninvoke(this.client, 'externalIp');
}

Client.prototype.close = function() {
  this.client.close();
}

module.exports = {
  client: Client
};

// one offs - so you can do ports.mapPort() and not think about creating a new client and closing it after
['mapPorts', 'mapPort', 'unmapPort', 'externalIp', 'clearMappings', 'isMappingAvailable'].forEach(function(method) {
  module.exports[method] = function() {
    var client = new Client();
    var promise = client[method].apply(client, arguments);
    promise.finally(function() {
      client.close();
    });

    return promise;
  }
});