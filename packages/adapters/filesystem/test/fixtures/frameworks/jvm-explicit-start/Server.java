import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class Server {
  public static void main(String[] args) throws Exception {
    int port = args.length > 0 ? Integer.parseInt(args[0]) : 3000;
    HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
    server.createContext(
      "/",
      exchange -> {
        byte[] response = "JVM explicit start fixture ready".getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, response.length);
        exchange.getResponseBody().write(response);
        exchange.close();
      }
    );
    server.start();
  }
}
