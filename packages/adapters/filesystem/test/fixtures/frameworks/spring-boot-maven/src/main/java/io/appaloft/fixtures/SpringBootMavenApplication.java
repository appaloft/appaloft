package io.appaloft.fixtures;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class SpringBootMavenApplication {
  public static void main(String[] args) {
    SpringApplication.run(SpringBootMavenApplication.class, args);
  }

  @GetMapping("/")
  public String index() {
    return "Spring Boot Maven fixture ready";
  }
}
