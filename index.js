var Q = require('q');
var natUpnp = require('nat-upnp');
var client = natUpnp.createClient();

function acquirePort(pub, priv, force) {
  var prep;
  if (force) 
    prep = unmapPort(pub);
  else {
    prep = isMappingAvailable(pub, priv)
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

function isMappingAvailable(pub, priv) {
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

function clearMappings(options) {
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

function unmapPort(pub) {
  return clearMappings({
    ports: [pub]
  })
}

function externalIp() {
  return Q.ninvoke(client, 'externalIp');
}

module.exports = {
  // isMappingAvailable: isMappingAvailable,
  clearMappings: clearMappings,
  externalIp: externalIp,
  mapPort: acquirePort,
  unmapPort: unmapPort
}