var Q = require('q');
var natUpnp = require('nat-upnp');

function Client() {
  if (!(this instanceof Client)) return new Client();

  this.client = natUpnp.createClient();
}

Client.prototype.mapPort = function(pub, priv, hijack) {
  var client = this.client;
  var prep;
  if (hijack) 
    prep = this.unmapPort(pub);
  else {
    prep = this.isMappingAvailable(pub, priv)
      .then(function(available) {
        if (!available) throw new Error('This mapping conflicts with an existing mapping');
      });
  }

  return prep.then(function() {
    return Q.ninvoke(client, 'portMapping', {
      public: pub,
      private: priv,
      ttl: 10
    });
  }) 
}

Client.prototype.isMappingAvailable = function(pub, priv) {
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
          (mapping.public.port === pub || mapping.private.port === priv)) {
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

  return Q.ninvoke(client, 'getMappings', options)
    .then(function(results) {
      var tasks = results.map(function(mapping) {
        // debugger;
        if (ports && ports.indexOf(mapping.public.port) === -1) return;
        if (protocol && mapping.protocol.toLowerCase() !== protocol) return;

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
['mapPort', 'unmapPort', 'externalIp', 'clearMappings', 'isMappingAvailable'].forEach(function(method) {
  module.exports[method] = function() {
    var client = new Client();
    var promise = client[method].apply(client, arguments);
    promise.finally(function() {
      client.close();
    });

    return promise;
  }
});